package com.swinglink.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Scans for nearby SwingLink BLE advertisers and reads their payloads.
 *
 * Android advertisers embed the payload in advertisement service data (fast path —
 * no GATT connection needed). iOS advertisers require a GATT connect + characteristic
 * read (slow path, ~200-500ms).
 *
 * A staleness handler fires every 3 seconds. Devices not seen for 10 seconds
 * emit onDeviceLost and are purged from the cache.
 */
class BLEScanner(private val context: Context) {
  companion object {
    private const val TAG = "BLEScanner"
    private const val STALENESS_INTERVAL_MS = 3000L
    private const val STALENESS_THRESHOLD_MS = 10000L
  }

  var onDeviceFound: ((Map<String, Any?>) -> Unit)? = null
  var onDeviceLost: ((String) -> Unit)? = null

  private var leScanner: BluetoothLeScanner? = null
  private val handler = Handler(Looper.getMainLooper())

  // Devices that have been fully read (fast or slow path)
  private val readDevices = mutableMapOf<String, MutableMap<String, Any?>>()

  // Last seen timestamps for staleness tracking
  private val lastSeenTimestamps = mutableMapOf<String, Long>()

  // GATT connections in progress (held to prevent GC)
  private val pendingGattConnections = mutableMapOf<String, BluetoothGatt>()

  private val stalenessRunnable = object : Runnable {
    override fun run() {
      pruneStaleDevices()
      handler.postDelayed(this, STALENESS_INTERVAL_MS)
    }
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult?) {
      result?.let { handleScanResult(it) }
    }

    override fun onScanFailed(errorCode: Int) {
      Log.e(TAG, "Scan failed: errorCode=$errorCode")
    }
  }

  /** Starts scanning for SwingLink BLE advertisers. */
  @Suppress("MissingPermission")
  fun startScanning() {
    val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = bluetoothManager?.adapter
    if (adapter == null || !adapter.isEnabled) {
      Log.w(TAG, "Bluetooth adapter not available or not enabled")
      return
    }

    val scanner = adapter.bluetoothLeScanner
    if (scanner == null) {
      Log.e(TAG, "BLE scanner not available")
      return
    }
    leScanner = scanner

    val filter = ScanFilter.Builder()
      .setServiceUuid(BLEConstants.SERVICE_PARCEL_UUID)
      .build()

    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .setReportDelay(0)
      .build()

    scanner.startScan(listOf(filter), settings, scanCallback)
    handler.postDelayed(stalenessRunnable, STALENESS_INTERVAL_MS)
  }

  /** Stops scanning, disconnects pending GATT connections, clears caches. */
  @Suppress("MissingPermission")
  fun stopScanning() {
    handler.removeCallbacks(stalenessRunnable)

    try {
      leScanner?.stopScan(scanCallback)
    } catch (e: Exception) {
      Log.w(TAG, "Error stopping scan", e)
    }
    leScanner = null

    for ((_, gatt) in pendingGattConnections) {
      try {
        gatt.disconnect()
        gatt.close()
      } catch (e: Exception) {
        Log.w(TAG, "Error closing GATT connection", e)
      }
    }

    pendingGattConnections.clear()
    readDevices.clear()
    lastSeenTimestamps.clear()
  }

  @Suppress("MissingPermission")
  private fun handleScanResult(result: ScanResult) {
    val device = result.device
    val deviceAddress = device.address
    val now = System.currentTimeMillis()
    val rssi = result.rssi

    // Capture device name now (may not be available inside GATT callback)
    val deviceName: String? = device.name

    lastSeenTimestamps[deviceAddress] = now

    // If already read, re-emit with updated RSSI (no reconnect)
    val cached = readDevices[deviceAddress]
    if (cached != null) {
      cached["rssi"] = rssi
      cached["lastSeen"] = now
      onDeviceFound?.invoke(cached)
      return
    }

    // Fast path: read service data from advertisement (Android advertiser)
    val serviceData = result.scanRecord?.getServiceData(BLEConstants.SERVICE_PARCEL_UUID)
    if (serviceData != null) {
      val parsed = BLEConstants.unpackPayload(serviceData)
      if (parsed != null) {
        val (platform, roomCode, _) = parsed
        val deviceInfo = mutableMapOf<String, Any?>(
          "id" to deviceAddress,
          "name" to deviceName,
          "platform" to platform,
          "roomCode" to roomCode,
          "rssi" to rssi,
          "lastSeen" to now,
        )
        readDevices[deviceAddress] = deviceInfo
        onDeviceFound?.invoke(deviceInfo)
        return
      }
    }

    // Slow path: GATT connect + characteristic read (iOS advertiser)
    if (pendingGattConnections.containsKey(deviceAddress)) return

    val gattCallback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          gatt?.discoverServices()
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          gatt?.close()
          pendingGattConnections.remove(deviceAddress)
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          gatt?.disconnect()
          return
        }
        val service = gatt?.getService(BLEConstants.SERVICE_UUID)
        val characteristic = service?.getCharacteristic(BLEConstants.PAYLOAD_CHARACTERISTIC_UUID)
        if (characteristic != null) {
          gatt.readCharacteristic(characteristic)
        } else {
          gatt?.disconnect()
        }
      }

      override fun onCharacteristicRead(
        gatt: BluetoothGatt?,
        characteristic: BluetoothGattCharacteristic?,
        status: Int
      ) {
        gatt?.disconnect()

        if (status != BluetoothGatt.GATT_SUCCESS) return

        @Suppress("DEPRECATION")
        val value = characteristic?.value ?: return
        val parsed = BLEConstants.unpackPayload(value) ?: return

        val (platform, roomCode, _) = parsed
        val currentRssi = rssi
        val deviceInfo = mutableMapOf<String, Any?>(
          "id" to deviceAddress,
          "name" to deviceName,
          "platform" to platform,
          "roomCode" to roomCode,
          "rssi" to currentRssi,
          "lastSeen" to System.currentTimeMillis(),
        )
        readDevices[deviceAddress] = deviceInfo
        lastSeenTimestamps[deviceAddress] = System.currentTimeMillis()
        onDeviceFound?.invoke(deviceInfo)
      }
    }

    val gatt = device.connectGatt(context, false, gattCallback)
    if (gatt != null) {
      pendingGattConnections[deviceAddress] = gatt
    }
  }

  @Suppress("MissingPermission")
  private fun pruneStaleDevices() {
    val now = System.currentTimeMillis()
    val staleIds = lastSeenTimestamps.filter { now - it.value > STALENESS_THRESHOLD_MS }.keys.toList()

    for (id in staleIds) {
      readDevices.remove(id)
      lastSeenTimestamps.remove(id)
      pendingGattConnections.remove(id)?.let { gatt ->
        try {
          gatt.disconnect()
          gatt.close()
        } catch (e: Exception) {
          Log.w(TAG, "Error closing stale GATT connection", e)
        }
      }
      onDeviceLost?.invoke(id)
    }
  }
}
