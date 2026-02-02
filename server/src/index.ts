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
    // Remove from all rooms
    rooms.forEach((participants, roomCode) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        socket.to(roomCode).emit('peer-left');

        // Clean up empty rooms
        if (participants.size === 0) {
          rooms.delete(roomCode);
          console.log(`Room deleted: ${roomCode}`);
        }
      }
    });

    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 SwingLink signaling server running on port ${PORT}`);
});
