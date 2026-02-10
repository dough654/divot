package com.swinglink.wifidirect

import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Camera-side TCP server for length-prefixed signaling relay.
 *
 * Accepts one client connection. Handles the hello/hello-ack handshake
 * before allowing signaling messages to flow.
 *
 * Frame format: [4-byte big-endian length][UTF-8 JSON payload]
 */
class TcpSignalingServer {
  companion object {
    private const val TAG = "WD-TcpServer"
  }

  var onClientConnected: ((peerName: String) -> Unit)? = null
  var onMessageReceived: ((message: Map<String, Any>) -> Unit)? = null
  var onClientDisconnected: (() -> Unit)? = null

  private var serverSocket: ServerSocket? = null
  private var clientSocket: Socket? = null
  private var outputStream: DataOutputStream? = null
  private val running = AtomicBoolean(false)

  /** The local port the server is listening on. Available after [start]. */
  val localPort: Int
    get() = serverSocket?.localPort ?: -1

  /**
   * Start the TCP server on an OS-assigned port.
   * Blocks the calling thread waiting for a single client connection.
   * Call from a background thread.
   */
  fun start() {
    running.set(true)

    val server = ServerSocket(0).also {
      it.soTimeout = 0 // block indefinitely on accept
    }
    serverSocket = server
    Log.i(TAG, "TCP server listening on port ${server.localPort}")

    try {
      val client = server.accept()
      if (!running.get()) {
        client.close()
        return
      }
      client.soTimeout = WifiDirectConstants.TCP_TIMEOUT_MS
      clientSocket = client
      Log.i(TAG, "Client connected from ${client.inetAddress.hostAddress}")

      val input = DataInputStream(client.getInputStream())
      val output = DataOutputStream(client.getOutputStream())
      outputStream = output

      // Read loop
      while (running.get() && !client.isClosed) {
        val frame = readFrame(input) ?: break
        handleFrame(frame)
      }
    } catch (e: IOException) {
      if (running.get()) {
        Log.e(TAG, "TCP server error", e)
      }
    } finally {
      Log.i(TAG, "Client disconnected")
      onClientDisconnected?.invoke()
    }
  }

  /** Send a length-prefixed JSON frame to the connected client. */
  fun send(message: Map<String, Any>) {
    val output = outputStream ?: run {
      Log.w(TAG, "send() called but no client connected")
      return
    }

    try {
      val json = org.json.JSONObject(message).toString()
      val bytes = json.toByteArray(Charsets.UTF_8)
      synchronized(output) {
        output.writeInt(bytes.size)
        output.write(bytes)
        output.flush()
      }
    } catch (e: IOException) {
      Log.e(TAG, "Failed to send message", e)
    }
  }

  /** Stop the server and close all sockets. */
  fun stop() {
    running.set(false)
    try { clientSocket?.close() } catch (_: IOException) {}
    try { serverSocket?.close() } catch (_: IOException) {}
    clientSocket = null
    outputStream = null
    serverSocket = null
    Log.i(TAG, "TCP server stopped")
  }

  private fun readFrame(input: DataInputStream): String? {
    return try {
      val length = input.readInt()
      if (length <= 0 || length > WifiDirectConstants.MAX_FRAME_SIZE) {
        Log.e(TAG, "Invalid frame length: $length")
        return null
      }
      val buffer = ByteArray(length)
      input.readFully(buffer)
      String(buffer, Charsets.UTF_8)
    } catch (e: IOException) {
      if (running.get()) {
        Log.d(TAG, "Read frame failed: ${e.message}")
      }
      null
    }
  }

  private fun handleFrame(raw: String) {
    try {
      val json = org.json.JSONObject(raw)
      val type = json.optString("type", "")

      when (type) {
        "hello" -> {
          val peerName = json.optString("payload", "Unknown Device")
          Log.i(TAG, "Received hello from: $peerName")
          // Clear the handshake timeout — the established connection may idle indefinitely.
          // Matches TcpSignalingClient's pattern after hello-ack.
          clientSocket?.soTimeout = 0
          onClientConnected?.invoke(peerName)
        }
        else -> {
          val map = mutableMapOf<String, Any>()
          for (key in json.keys()) {
            map[key] = json.get(key)
          }
          onMessageReceived?.invoke(map)
        }
      }
    } catch (e: org.json.JSONException) {
      Log.e(TAG, "Failed to parse frame: $raw", e)
    }
  }
}
