package com.swinglink.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.util.Log

/**
 * Manages BLE advertising with a GATT service for SwingLink device discovery.
 *
 * Android advertisers pack the payload into both advertisement service data (fast path
 * for Android scanners) and a GATT readable characteristic (for iOS scanners that need
 * a GATT connection to read the payload).
 */
class BLEAdvertiser(private val context: Context) {
  companion object {
    private const val TAG = "BLEAdvertiser"
  }

  private var advertiser: BluetoothLeAdvertiser? = null
  private var gattServer: BluetoothGattServer? = null
  private var payloadData: ByteArray? = null

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
      Log.d(TAG, "Advertising started")
    }

    override fun onStartFailure(errorCode: Int) {
      Log.e(TAG, "Advertising failed to start: errorCode=$errorCode")
    }
  }

  private val gattServerCallback = object : BluetoothGattServerCallback() {
    override fun onCharacteristicReadRequest(
      device: android.bluetooth.BluetoothDevice?,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic?
    ) {
      val data = payloadData
      if (characteristic?.uuid == BLEConstants.PAYLOAD_CHARACTERISTIC_UUID && data != null) {
        if (offset >= data.size) {
          gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
          return
        }
        val responseData = data.copyOfRange(offset, data.size)
        gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_SUCCESS, offset, responseData)
      } else {
        gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_FAILURE, 0, null)
      }
    }
  }

  /** Starts advertising with the given room code. */
  @Suppress("MissingPermission")
  fun startAdvertising(roomCode: String) {
    val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = bluetoothManager?.adapter
    if (adapter == null || !adapter.isEnabled) {
      Log.w(TAG, "Bluetooth adapter not available or not enabled")
      return
    }

    payloadData = BLEConstants.packPayload(roomCode)
    setupGattServer(bluetoothManager)
    beginAdvertising(adapter)
  }

  /** Stops advertising and closes the GATT server. */
  @Suppress("MissingPermission")
  fun stopAdvertising() {
    try {
      advertiser?.stopAdvertising(advertiseCallback)
    } catch (e: Exception) {
      Log.w(TAG, "Error stopping advertising", e)
    }
    advertiser = null

    try {
      gattServer?.clearServices()
      gattServer?.close()
    } catch (e: Exception) {
      Log.w(TAG, "Error closing GATT server", e)
    }
    gattServer = null
    payloadData = null
  }

  @Suppress("MissingPermission")
  private fun setupGattServer(bluetoothManager: BluetoothManager) {
    val server = bluetoothManager.openGattServer(context, gattServerCallback)
    gattServer = server

    val characteristic = BluetoothGattCharacteristic(
      BLEConstants.PAYLOAD_CHARACTERISTIC_UUID,
      BluetoothGattCharacteristic.PROPERTY_READ,
      BluetoothGattCharacteristic.PERMISSION_READ
    )

    val service = BluetoothGattService(
      BLEConstants.SERVICE_UUID,
      BluetoothGattService.SERVICE_TYPE_PRIMARY
    )
    service.addCharacteristic(characteristic)
    server.addService(service)
  }

  @Suppress("MissingPermission")
  private fun beginAdvertising(adapter: BluetoothAdapter) {
    val leAdvertiser = adapter.bluetoothLeAdvertiser
    if (leAdvertiser == null) {
      Log.e(TAG, "BLE advertiser not available")
      return
    }
    advertiser = leAdvertiser

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setConnectable(true) // Allow iOS scanners to connect for GATT reads
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .build()

    val advertiseData = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .addServiceUuid(BLEConstants.SERVICE_PARCEL_UUID)
      .addServiceData(BLEConstants.SERVICE_PARCEL_UUID, payloadData)
      .build()

    val scanResponse = AdvertiseData.Builder()
      .setIncludeDeviceName(true)
      .build()

    leAdvertiser.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)
  }
}
