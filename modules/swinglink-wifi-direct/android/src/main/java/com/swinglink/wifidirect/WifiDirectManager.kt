package com.swinglink.wifidirect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.NetworkInfo
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.os.Build
import android.util.Log
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Core orchestrator for Wi-Fi Direct signaling.
 *
 * Camera flow: createGroup → start TCP server → register DNS-SD service →
 *   wait for viewer hello → emit onInvitationReceived → respondToInvitation →
 *   hello-ack → onPeerConnected.
 *
 * Viewer flow: discover DNS-SD services → connect to group → start TCP client →
 *   send hello → wait for hello-ack → onPeerConnected.
 *
 * All state mutations are serialized through a single-thread executor,
 * mirroring the iOS serial dispatch queue pattern.
 */
class WifiDirectManager(private val context: Context) {

  companion object {
    private const val TAG = "WD-Manager"
  }

  // -- Callbacks to Module --

  var onPeerConnected: (() -> Unit)? = null
  var onPeerDisconnected: (() -> Unit)? = null
  var onSignalingMessage: ((Map<String, Any>) -> Unit)? = null
  var onInvitationReceived: ((peerName: String) -> Unit)? = null

  // -- Wi-Fi P2P --

  private val wifiP2pManager: WifiP2pManager =
    context.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager
  private val channel: WifiP2pManager.Channel =
    wifiP2pManager.initialize(context, context.mainLooper, null)

  // -- Sub-components --

  private var serviceRegistrar: ServiceRegistrar? = null
  private var serviceDiscoverer: ServiceDiscoverer? = null
  private var tcpServer: TcpSignalingServer? = null
  private var tcpClient: TcpSignalingClient? = null

  // -- State --

  private val executor: ExecutorService = Executors.newSingleThreadExecutor { r ->
    Thread(r, "WifiDirectManager").also { it.isDaemon = true }
  }

  /** Background thread for TCP I/O (server accept loop or client connect+read loop). */
  private var tcpThread: Thread? = null

  private var broadcastReceiver: BroadcastReceiver? = null
  private var isCamera = false
  private var roomCode: String? = null
  private var targetPort: Int = -1
  private var localDeviceName: String = Build.MODEL

  /** Future that the TCP server hello callback awaits for the JS respondToInvitation result. */
  private var invitationFuture: CompletableFuture<Boolean>? = null

  /** Cached connection info when CONNECTION_CHANGED fires before service discovery sets targetPort. */
  private var pendingConnectionInfo: WifiP2pInfo? = null

  // ─── Camera: startAdvertising ──────────────────────────────────

  fun startAdvertising(roomCode: String) {
    executor.execute {
      tearDown()

      this.isCamera = true
      this.roomCode = roomCode
      Log.i(TAG, "startAdvertising: room=$roomCode")

      registerReceiver()

      // Create Wi-Fi Direct group — this device becomes Group Owner
      wifiP2pManager.createGroup(channel, object : WifiP2pManager.ActionListener {
        override fun onSuccess() {
          Log.i(TAG, "Wi-Fi Direct group created (GO)")
          executor.execute { startCameraTcpAndService(roomCode) }
        }

        override fun onFailure(reason: Int) {
          Log.e(TAG, "Failed to create group: reason=$reason")
        }
      })
    }
  }

  private fun startCameraTcpAndService(roomCode: String) {
    val server = TcpSignalingServer()
    tcpServer = server

    server.onClientConnected = { peerName ->
      executor.execute { handleViewerHello(peerName) }
    }

    server.onMessageReceived = { message ->
      onSignalingMessage?.invoke(message)
    }

    server.onClientDisconnected = {
      executor.execute {
        Log.i(TAG, "TCP client disconnected from server")
        onPeerDisconnected?.invoke()
      }
    }

    // Start TCP server on a background thread so accept() can block
    tcpThread = Thread({
      server.start()
    }, "WD-TcpServer").also { it.isDaemon = true; it.start() }

    // Give the server socket a moment to bind
    Thread.sleep(100)

    val port = server.localPort
    if (port <= 0) {
      Log.e(TAG, "TCP server failed to bind")
      return
    }

    Log.i(TAG, "TCP server bound to port $port")

    val registrar = ServiceRegistrar(wifiP2pManager, channel)
    serviceRegistrar = registrar
    registrar.registerService(roomCode, port)
  }

  private fun handleViewerHello(peerName: String) {
    Log.i(TAG, "Viewer hello received: $peerName")

    // Create a future that respondToInvitation will complete
    val future = CompletableFuture<Boolean>()
    invitationFuture = future

    // Notify JS
    onInvitationReceived?.invoke(peerName)

    // Wait for JS response on a separate thread to avoid blocking the executor
    Thread({
      try {
        val accepted = future.get()
        executor.execute {
          if (accepted) {
            Log.i(TAG, "Invitation accepted, sending hello-ack:accepted")
            tcpServer?.send(mapOf("type" to "hello-ack", "payload" to "accepted"))
            onPeerConnected?.invoke()
          } else {
            Log.i(TAG, "Invitation rejected, sending hello-ack:rejected")
            tcpServer?.send(mapOf("type" to "hello-ack", "payload" to "rejected"))
            onPeerDisconnected?.invoke()
          }
          invitationFuture = null
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error waiting for invitation response", e)
      }
    }, "WD-InvitationWait").also { it.isDaemon = true }.start()
  }

  // ─── Viewer: startBrowsing ────────────────────────────────────

  fun startBrowsing(roomCode: String) {
    executor.execute {
      tearDown()

      this.isCamera = false
      this.roomCode = roomCode
      Log.i(TAG, "startBrowsing: room=$roomCode")

      registerReceiver()

      val discoverer = ServiceDiscoverer(wifiP2pManager, channel)
      serviceDiscoverer = discoverer

      discoverer.onServiceFound = { device, _, port ->
        executor.execute { handleServiceFound(device, port) }
      }

      discoverer.startDiscovery(roomCode)
    }
  }

  private fun handleServiceFound(device: WifiP2pDevice, port: Int) {
    Log.i(TAG, "Service found: device=${device.deviceAddress} port=$port")
    targetPort = port

    // Stop discovery — we found our match
    serviceDiscoverer?.stopDiscovery()

    // If CONNECTION_CHANGED already fired before discovery completed, use the cached info
    val cached = pendingConnectionInfo
    if (cached != null) {
      Log.i(TAG, "Using cached connection info (CONNECTION_CHANGED fired before service found)")
      pendingConnectionInfo = null
      startViewerTcpClient(cached)
      return
    }

    val config = WifiP2pConfig().apply {
      deviceAddress = device.deviceAddress
    }

    wifiP2pManager.connect(channel, config, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Wi-Fi Direct connect initiated to ${device.deviceAddress}")
        // CONNECTION_CHANGED broadcast will fire when actually connected.
        // Also request connection info explicitly — if devices are already
        // connected (from a prior session), CONNECTION_CHANGED won't re-fire.
        wifiP2pManager.requestConnectionInfo(channel) { info ->
          executor.execute {
            if (info.groupFormed && tcpClient == null) {
              Log.i(TAG, "Already connected, starting TCP client from explicit info request")
              startViewerTcpClient(info)
            }
          }
        }
      }

      override fun onFailure(reason: Int) {
        Log.e(TAG, "Failed to connect: reason=$reason")
      }
    })
  }

  /** Called from BroadcastReceiver when Wi-Fi Direct group is formed and we're connected. */
  private fun handleConnectionChanged(info: WifiP2pInfo) {
    if (!info.groupFormed) {
      Log.d(TAG, "Group not formed yet")
      return
    }

    // Camera doesn't need to do anything here — TCP server is already running
    if (isCamera) {
      Log.d(TAG, "Camera: group formed, TCP server already running")
      return
    }

    // Viewer: if service discovery hasn't set the port yet, cache this info
    // for handleServiceFound to pick up later.
    if (targetPort <= 0) {
      Log.d(TAG, "Viewer: Wi-Fi Direct connected but target port not yet known, caching connection info")
      pendingConnectionInfo = info
      return
    }

    startViewerTcpClient(info)
  }

  /**
   * Starts the viewer-side TCP client to connect to the camera's signaling server.
   * Called from handleConnectionChanged (normal flow) or handleServiceFound (cached/explicit flow).
   * Must be called on the executor thread.
   */
  private fun startViewerTcpClient(info: WifiP2pInfo) {
    // Guard against double-start
    if (tcpClient != null) {
      Log.d(TAG, "TCP client already started, ignoring")
      return
    }

    val goAddress = info.groupOwnerAddress?.hostAddress
    if (goAddress == null) {
      Log.e(TAG, "Group owner address is null")
      return
    }

    val port = targetPort
    if (port <= 0) {
      Log.e(TAG, "Target port not set, cannot connect TCP client")
      return
    }

    Log.i(TAG, "Viewer: connecting TCP client to $goAddress:$port")

    val client = TcpSignalingClient()
    tcpClient = client

    client.onConnected = {
      executor.execute {
        Log.i(TAG, "TCP client connected and accepted")
        onPeerConnected?.invoke()
      }
    }

    client.onRejected = {
      executor.execute {
        Log.i(TAG, "Invitation rejected by camera")
        onPeerDisconnected?.invoke()
      }
    }

    client.onMessageReceived = { message ->
      onSignalingMessage?.invoke(message)
    }

    client.onDisconnected = {
      executor.execute {
        Log.i(TAG, "TCP client disconnected")
        onPeerDisconnected?.invoke()
      }
    }

    tcpThread = Thread({
      client.connect(goAddress, port, localDeviceName)
    }, "WD-TcpClient").also { it.isDaemon = true; it.start() }
  }

  // ─── Sending ──────────────────────────────────────────────────

  fun sendMessage(type: String, payload: String) {
    executor.execute {
      val message = mapOf("type" to type, "payload" to payload)
      if (isCamera) {
        tcpServer?.send(message)
      } else {
        tcpClient?.send(message)
      }
    }
  }

  // ─── Invitation response ──────────────────────────────────────

  fun respondToInvitation(accept: Boolean) {
    executor.execute {
      val future = invitationFuture
      if (future == null) {
        Log.w(TAG, "respondToInvitation called but no pending invitation")
        return@execute
      }
      future.complete(accept)
    }
  }

  // ─── Disconnect / Teardown ────────────────────────────────────

  fun disconnect() {
    executor.execute { tearDown() }
  }

  /** Must be called on the executor thread. */
  private fun tearDown() {
    Log.i(TAG, "tearDown")

    // Reject pending invitation
    invitationFuture?.complete(false)
    invitationFuture = null

    // Stop TCP
    tcpServer?.stop()
    tcpServer = null
    tcpClient?.disconnect()
    tcpClient = null
    tcpThread?.interrupt()
    tcpThread = null

    // Stop service registration/discovery
    serviceRegistrar?.unregisterService()
    serviceRegistrar = null
    serviceDiscoverer?.stopDiscovery()
    serviceDiscoverer = null

    // Unregister broadcast receiver
    try {
      broadcastReceiver?.let { context.unregisterReceiver(it) }
    } catch (e: IllegalArgumentException) {
      // Already unregistered
    }
    broadcastReceiver = null

    // Remove Wi-Fi Direct group
    wifiP2pManager.removeGroup(channel, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Wi-Fi Direct group removed")
      }

      override fun onFailure(reason: Int) {
        // reason=0 (ERROR) if no group exists, reason=2 (BUSY) if framework is occupied
        Log.d(TAG, "removeGroup: reason=$reason")
      }
    })

    roomCode = null
    targetPort = -1
    pendingConnectionInfo = null
  }

  // ─── BroadcastReceiver ────────────────────────────────────────

  private fun registerReceiver() {
    val filter = IntentFilter().apply {
      addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
      addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
      addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
          WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
            val state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1)
            if (state == WifiP2pManager.WIFI_P2P_STATE_ENABLED) {
              Log.i(TAG, "Wi-Fi P2P is enabled")
            } else {
              Log.w(TAG, "Wi-Fi P2P is disabled")
            }
          }

          WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
            @Suppress("DEPRECATION")
            val networkInfo = intent.getParcelableExtra<NetworkInfo>(WifiP2pManager.EXTRA_NETWORK_INFO)
            if (networkInfo?.isConnected == true) {
              Log.i(TAG, "Wi-Fi P2P connected, requesting connection info")
              wifiP2pManager.requestConnectionInfo(channel) { info ->
                executor.execute { handleConnectionChanged(info) }
              }
            } else {
              Log.d(TAG, "Wi-Fi P2P disconnected")
            }
          }

          WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION -> {
            @Suppress("DEPRECATION")
            val device = intent.getParcelableExtra<WifiP2pDevice>(WifiP2pManager.EXTRA_WIFI_P2P_DEVICE)
            device?.deviceName?.takeIf { it.isNotEmpty() }?.let {
              Log.i(TAG, "Local device name: $it")
              localDeviceName = it
            }
          }
        }
      }
    }

    broadcastReceiver = receiver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
  }
}
