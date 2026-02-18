package com.swinglink.wifidirect

import android.net.wifi.p2p.WifiP2pManager
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo
import android.util.Log

/**
 * Registers a DNS-SD local service so nearby viewers can discover this camera
 * via Wi-Fi Direct service discovery.
 *
 * The TXT record carries the room code and TCP port so the viewer knows
 * which room to join and where to open the signaling socket.
 */
class ServiceRegistrar(
  private val wifiP2pManager: WifiP2pManager,
  private val channel: WifiP2pManager.Channel,
) {
  companion object {
    private const val TAG = "WD-ServiceRegistrar"
  }

  private var serviceInfo: WifiP2pDnsSdServiceInfo? = null

  /** Register a DNS-SD service advertising the given room code and TCP port. */
  fun registerService(roomCode: String, port: Int) {
    val txtRecord = mapOf(
      WifiDirectConstants.TXT_ROOM_CODE to roomCode,
      WifiDirectConstants.TXT_PORT to port.toString(),
      WifiDirectConstants.TXT_PLATFORM to WifiDirectConstants.PLATFORM_ANDROID,
    )

    val info = WifiP2pDnsSdServiceInfo.newInstance(
      "divot_$roomCode",
      WifiDirectConstants.SERVICE_TYPE,
      txtRecord,
    )
    serviceInfo = info

    wifiP2pManager.addLocalService(channel, info, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Service registered: room=$roomCode port=$port")
      }

      override fun onFailure(reason: Int) {
        Log.e(TAG, "Failed to register service: reason=$reason")
      }
    })
  }

  /** Remove the previously registered local service. */
  fun unregisterService() {
    val info = serviceInfo ?: return
    wifiP2pManager.removeLocalService(channel, info, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Service unregistered")
      }

      override fun onFailure(reason: Int) {
        Log.w(TAG, "Failed to unregister service: reason=$reason")
      }
    })
    serviceInfo = null
  }
}
