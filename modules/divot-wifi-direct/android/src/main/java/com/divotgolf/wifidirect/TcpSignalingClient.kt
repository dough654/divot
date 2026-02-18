package com.divotgolf.wifidirect

import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Viewer-side TCP client for length-prefixed signaling relay.
 *
 * Connects to the camera's TCP server (Group Owner IP + port from TXT record).
 * Sends a `hello` message with the device name, waits for `hello-ack`.
 *
 * Frame format: [4-byte big-endian length][UTF-8 JSON payload]
 */
class TcpSignalingClient {
  companion object {
    private const val TAG = "WD-TcpClient"
  }

  var onConnected: (() -> Unit)? = null
  var onRejected: (() -> Unit)? = null
  var onMessageReceived: ((message: Map<String, Any>) -> Unit)? = null
  var onDisconnected: (() -> Unit)? = null

  private var socket: Socket? = null
  private var outputStream: DataOutputStream? = null
  private val running = AtomicBoolean(false)

  /**
   * Connect to the camera's TCP server, send hello, and start reading.
   * Blocks the calling thread. Call from a background thread.
   */
  fun connect(host: String, port: Int, deviceName: String) {
    running.set(true)
    Log.i(TAG, "Connecting to $host:$port")

    try {
      val sock = Socket()
      sock.connect(InetSocketAddress(host, port), WifiDirectConstants.TCP_TIMEOUT_MS)
      sock.soTimeout = WifiDirectConstants.TCP_TIMEOUT_MS
      socket = sock

      val input = DataInputStream(sock.getInputStream())
      val output = DataOutputStream(sock.getOutputStream())
      outputStream = output

      // Send hello with our device name
      sendFrame(output, mapOf("type" to "hello", "payload" to deviceName))
      Log.i(TAG, "Sent hello as '$deviceName'")

      // Wait for hello-ack
      val ackFrame = readFrame(input)
      if (ackFrame == null) {
        Log.e(TAG, "No hello-ack received")
        onDisconnected?.invoke()
        return
      }

      val ackJson = org.json.JSONObject(ackFrame)
      if (ackJson.optString("type") != "hello-ack") {
        Log.e(TAG, "Expected hello-ack, got: ${ackJson.optString("type")}")
        onDisconnected?.invoke()
        return
      }

      val ackPayload = ackJson.optString("payload", "")
      if (ackPayload == "rejected") {
        Log.i(TAG, "Invitation rejected by camera")
        onRejected?.invoke()
        return
      }

      Log.i(TAG, "Connected and accepted by camera")
      // Clear the read timeout for the ongoing message loop
      sock.soTimeout = 0
      onConnected?.invoke()

      // Read loop for signaling messages
      while (running.get() && !sock.isClosed) {
        val frame = readFrame(input) ?: break
        handleSignalingFrame(frame)
      }
    } catch (e: IOException) {
      if (running.get()) {
        Log.e(TAG, "TCP client error", e)
      }
    } finally {
      Log.i(TAG, "Disconnected")
      onDisconnected?.invoke()
    }
  }

  /** Send a length-prefixed JSON frame to the camera. */
  fun send(message: Map<String, Any>) {
    val output = outputStream ?: run {
      Log.w(TAG, "send() called but not connected")
      return
    }

    try {
      sendFrame(output, message)
    } catch (e: IOException) {
      Log.e(TAG, "Failed to send message", e)
    }
  }

  /** Disconnect and close the socket. */
  fun disconnect() {
    running.set(false)
    try { socket?.close() } catch (_: IOException) {}
    socket = null
    outputStream = null
    Log.i(TAG, "TCP client stopped")
  }

  private fun sendFrame(output: DataOutputStream, message: Map<String, Any>) {
    val json = org.json.JSONObject(message).toString()
    val bytes = json.toByteArray(Charsets.UTF_8)
    synchronized(output) {
      output.writeInt(bytes.size)
      output.write(bytes)
      output.flush()
    }
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

  private fun handleSignalingFrame(raw: String) {
    try {
      val json = org.json.JSONObject(raw)
      val map = mutableMapOf<String, Any>()
      for (key in json.keys()) {
        map[key] = json.get(key)
      }
      onMessageReceived?.invoke(map)
    } catch (e: org.json.JSONException) {
      Log.e(TAG, "Failed to parse frame: $raw", e)
    }
  }
}
