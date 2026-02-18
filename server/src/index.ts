import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const httpServer = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.engine.on('connection_error', (err) => {
  console.log('[Engine] Connection error:', err.code, err.message, err.context);
});

// Room code characters (excluding ambiguous characters)
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

// Track rooms and their participants
const rooms = new Map<string, Set<string>>();

// Track pending connection requests (roomCode → requester socket id)
const pendingRequests = new Map<string, string>();

/**
 * Generates a random room code.
 */
const generateRoomCode = (): string => {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
  }
  return code;
};

/**
 * Gets a unique room code.
 */
const getUniqueRoomCode = (): string => {
  let code = generateRoomCode();
  while (rooms.has(code)) {
    code = generateRoomCode();
  }
  return code;
};

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  /**
   * Create a new room and return the room code.
   */
  socket.on('create-room', (callback: (response: { roomCode?: string; error?: string }) => void) => {
    const roomCode = getUniqueRoomCode();
    rooms.set(roomCode, new Set([socket.id]));
    socket.join(roomCode);

    console.log(`Room created: ${roomCode} by ${socket.id}`);
    callback({ roomCode });
  });

  /**
   * Join an existing room.
   */
  socket.on('join-room', (roomCode: string, callback: (response: { success?: boolean; error?: string }) => void) => {
    const room = rooms.get(roomCode);

    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }

    if (room.size >= 2) {
      callback({ error: 'Room is full' });
      return;
    }

    room.add(socket.id);
    socket.join(roomCode);

    // Notify the other participant
    socket.to(roomCode).emit('peer-joined');

    console.log(`Client ${socket.id} joined room: ${roomCode}`);
    callback({ success: true });
  });

  /**
   * Rejoin an existing room (or re-create it).
   * Camera role: re-creates room if it was cleaned up, then joins.
   * Viewer role: joins existing room (fails if room doesn't exist yet).
   */
  socket.on('rejoin-room', (data: { roomCode: string; role: 'camera' | 'viewer' }, callback: (response: { success?: boolean; error?: string }) => void) => {
    const { roomCode, role } = data;
    let room = rooms.get(roomCode);

    if (role === 'camera') {
      if (!room) {
        room = new Set();
        rooms.set(roomCode, room);
        console.log(`Room re-created: ${roomCode} by ${socket.id}`);
      }

      // Remove stale entry if already present (reconnecting same socket)
      room.delete(socket.id);

      if (room.size >= 2) {
        callback({ error: 'Room is full' });
        return;
      }

      room.add(socket.id);
      socket.join(roomCode);

      // Notify any existing peer
      socket.to(roomCode).emit('peer-joined');

      console.log(`Camera ${socket.id} rejoined room: ${roomCode}`);
      callback({ success: true });
    } else {
      // Viewer: room must exist (camera should rejoin first)
      if (!room) {
        callback({ error: 'Room not found' });
        return;
      }

      room.delete(socket.id);

      if (room.size >= 2) {
        callback({ error: 'Room is full' });
        return;
      }

      room.add(socket.id);
      socket.join(roomCode);

      socket.to(roomCode).emit('peer-joined');

      console.log(`Viewer ${socket.id} rejoined room: ${roomCode}`);
      callback({ success: true });
    }
  });

  /**
   * Leave the current room.
   */
  socket.on('leave-room', (roomCode: string) => {
    const room = rooms.get(roomCode);
    if (room) {
      room.delete(socket.id);
      socket.leave(roomCode);
      socket.to(roomCode).emit('peer-left');

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(roomCode);
        console.log(`Room deleted: ${roomCode}`);
      }

      console.log(`Client ${socket.id} left room: ${roomCode}`);
    }
  });

  /**
   * Request to join a room (BLE tap flow). Camera must accept before viewer can join.
   */
  socket.on('room:request', (
    data: { roomCode: string; deviceName: string; platform: string },
    callback: (response: { success?: boolean; error?: string }) => void,
  ) => {
    const room = rooms.get(data.roomCode);

    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }

    if (room.size >= 2) {
      callback({ error: 'Room is full' });
      return;
    }

    const existingRequester = pendingRequests.get(data.roomCode);
    if (existingRequester && existingRequester !== socket.id) {
      callback({ error: 'Request already pending' });
      return;
    }

    pendingRequests.set(data.roomCode, socket.id);

    // Forward request to the camera (everyone else in the room)
    socket.to(data.roomCode).emit('room:request', {
      deviceName: data.deviceName,
      platform: data.platform,
      requesterId: socket.id,
    });

    console.log(`Connection request in room ${data.roomCode} from ${socket.id}`);
    callback({ success: true });
  });

  /**
   * Respond to a connection request (camera accepts/declines).
   */
  socket.on('room:request-response', (data: { roomCode: string; requesterId: string; accepted: boolean; reason?: string }) => {
    pendingRequests.delete(data.roomCode);

    io.to(data.requesterId).emit('room:request-response', {
      accepted: data.accepted,
      ...(data.reason && { reason: data.reason }),
    });

    console.log(`Connection request ${data.accepted ? 'accepted' : 'declined'}${data.reason ? ` (${data.reason})` : ''} in room ${data.roomCode}`);
  });

  /**
   * Relay SDP offer to the other participant.
   */
  socket.on('offer', (data: { room: string; sdp: string }) => {
    socket.to(data.room).emit('offer', { sdp: data.sdp });
    console.log(`Offer relayed in room: ${data.room}`);
  });

  /**
   * Relay SDP answer to the other participant.
   */
  socket.on('answer', (data: { room: string; sdp: string }) => {
    socket.to(data.room).emit('answer', { sdp: data.sdp });
    console.log(`Answer relayed in room: ${data.room}`);
  });

  /**
   * Relay ICE candidate to the other participant.
   */
  socket.on('ice-candidate', (data: { room: string; candidate: object }) => {
    socket.to(data.room).emit('ice-candidate', { candidate: data.candidate });
  });

  /**
   * Handle disconnection.
   */
  socket.on('disconnect', () => {
    // Clean up pending requests from this socket
    pendingRequests.forEach((requesterId, roomCode) => {
      if (requesterId === socket.id) {
        pendingRequests.delete(roomCode);
      }
    });

    // Remove from all rooms
    rooms.forEach((participants, roomCode) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        socket.to(roomCode).emit('peer-left');

        // Clean up empty rooms and their pending requests
        if (participants.size === 0) {
          rooms.delete(roomCode);
          pendingRequests.delete(roomCode);
          console.log(`Room deleted: ${roomCode}`);
        }
      }
    });

    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Divot signaling server running on port ${PORT}`);
});
