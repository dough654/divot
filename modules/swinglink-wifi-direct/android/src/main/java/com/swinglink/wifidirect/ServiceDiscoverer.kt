package com.swinglink.wifidirect

import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pManager
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest
import android.util.Log

/**
 * Discovers DNS-SD services advertised by camera devices.
 *
 * Sets both a TXT record listener (to capture room code + port) and a service
 * response listener (to capture the WifiP2pDevice). These fire independently
 * so we correlate them by device address.
 */
class ServiceDiscoverer(
  private val wifiP2pManager: WifiP2pManager,
  private val channel: WifiP2pManager.Channel,
) {
  companion object {
    private const val TAG = "WD-ServiceDiscoverer"
  }

  /** Callback when a matching service is found. */
  var onServiceFound: ((device: WifiP2pDevice, roomCode: String, port: Int) -> Unit)? = null

  private var serviceRequest: WifiP2pDnsSdServiceRequest? = null

  /**
   * Pending TXT records keyed by device address, waiting for the service response.
   * Android fires TXT record and service response listeners independently with
   * no guaranteed ordering, so we store whichever arrives first and match when
   * the second arrives.
   */
  private val pendingTxtRecords = mutableMapOf<String, Map<String, String>>()

  /** Pending service responses keyed by device address, waiting for the TXT record. */
  private val pendingServiceDevices = mutableMapOf<String, WifiP2pDevice>()

  /** Tracks whether we already emitted a match to avoid duplicate callbacks. */
  private var matched = false

  /** Start discovering services for the given room code. */
  fun startDiscovery(targetRoomCode: String) {
    // Set TXT record listener — fires when we receive a TXT record from a peer.
    // Also set service response listener — fires when a DNS-SD service is found.
    // These two fire independently in arbitrary order on Android, so we correlate
    // them by device address and emit a match when both have arrived.
    wifiP2pManager.setDnsSdResponseListeners(
      channel,
      /* serviceResponseListener */ { instanceName, registrationType, device ->
        Log.d(TAG, "Service response: instance=$instanceName type=$registrationType device=${device.deviceAddress}")

        val txtRecord = pendingTxtRecords.remove(device.deviceAddress)
        if (txtRecord != null) {
          // TXT arrived first — we have both, try to match
          tryEmitMatch(device, txtRecord, targetRoomCode)
        } else {
          // TXT hasn't arrived yet — stash the device and wait
          Log.d(TAG, "No TXT record yet for ${device.deviceAddress}, stashing service response")
          pendingServiceDevices[device.deviceAddress] = device
        }
      },
      /* txtRecordListener */ { fullDomainName, txtRecord, device ->
        Log.d(TAG, "TXT record from ${device.deviceAddress}: $txtRecord")

        val pendingDevice = pendingServiceDevices.remove(device.deviceAddress)
        if (pendingDevice != null) {
          // Service response arrived first — we have both, try to match
          tryEmitMatch(pendingDevice, txtRecord, targetRoomCode)
        } else {
          // Service response hasn't arrived yet — stash the TXT record and wait
          pendingTxtRecords[device.deviceAddress] = txtRecord
        }
      },
    )

    val request = WifiP2pDnsSdServiceRequest.newInstance()
    serviceRequest = request

    wifiP2pManager.addServiceRequest(channel, request, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Service request added, starting discovery")
        wifiP2pManager.discoverServices(channel, object : WifiP2pManager.ActionListener {
          override fun onSuccess() {
            Log.i(TAG, "Service discovery started for room=$targetRoomCode")
          }

          override fun onFailure(reason: Int) {
            Log.e(TAG, "Failed to start service discovery: reason=$reason")
          }
        })
      }

      override fun onFailure(reason: Int) {
        Log.e(TAG, "Failed to add service request: reason=$reason")
      }
    })
  }

  /** Validates the TXT record and emits onServiceFound if room code matches. */
  private fun tryEmitMatch(device: WifiP2pDevice, txtRecord: Map<String, String>, targetRoomCode: String) {
    if (matched) return

    val roomCode = txtRecord[WifiDirectConstants.TXT_ROOM_CODE]
    val portStr = txtRecord[WifiDirectConstants.TXT_PORT]

    if (roomCode == null || portStr == null) {
      Log.w(TAG, "Missing room code or port in TXT record")
      return
    }

    if (roomCode != targetRoomCode) {
      Log.d(TAG, "Room code mismatch: found=$roomCode target=$targetRoomCode")
      return
    }

    val port = portStr.toIntOrNull()
    if (port == null || port <= 0) {
      Log.w(TAG, "Invalid port in TXT record: $portStr")
      return
    }

    matched = true
    Log.i(TAG, "Found matching service: room=$roomCode port=$port device=${device.deviceAddress}")
    onServiceFound?.invoke(device, roomCode, port)
  }

  /** Stop discovery and clean up service requests. */
  fun stopDiscovery() {
    pendingTxtRecords.clear()
    pendingServiceDevices.clear()
    matched = false
    val request = serviceRequest ?: return
    wifiP2pManager.removeServiceRequest(channel, request, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        Log.i(TAG, "Service request removed")
      }

      override fun onFailure(reason: Int) {
        Log.w(TAG, "Failed to remove service request: reason=$reason")
      }
    })
    serviceRequest = null
  }
}
