package com.swinglink.ble

import android.content.Context
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Thin Expo Module wiring for SwingLink BLE advertising and scanning. */
class SwingLinkBLEModule : Module() {
  companion object {
    private const val TAG = "SwingLinkBLEModule"
  }

  private val advertiser by lazy {
    Log.i(TAG, "Creating BLEAdvertiser (lazy init)")
    BLEAdvertiser(requireContext())
  }

  private val scanner by lazy {
    Log.i(TAG, "Creating BLEScanner (lazy init)")
    BLEScanner(requireContext()).also { scanner ->
      scanner.onDeviceFound = { deviceInfo ->
        Log.d(TAG, "Forwarding onDeviceFound to JS: ${deviceInfo["id"]}")
        sendEvent("onDeviceFound", deviceInfo)
      }
      scanner.onDeviceLost = { deviceId ->
        Log.d(TAG, "Forwarding onDeviceLost to JS: $deviceId")
        sendEvent("onDeviceLost", mapOf("id" to deviceId))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SwingLinkBLE")

    Events("onDeviceFound", "onDeviceLost")

    Function("startAdvertising") { roomCode: String ->
      Log.i(TAG, "startAdvertising called from JS with roomCode=$roomCode")
      try {
        advertiser.startAdvertising(roomCode)
        Log.i(TAG, "startAdvertising completed")
      } catch (e: Exception) {
        Log.e(TAG, "startAdvertising failed", e)
        throw e
      }
    }

    Function("stopAdvertising") {
      Log.i(TAG, "stopAdvertising called from JS")
      advertiser.stopAdvertising()
    }

    Function("startScanning") {
      Log.i(TAG, "startScanning called from JS")
      try {
        scanner.startScanning()
        Log.i(TAG, "startScanning completed")
      } catch (e: Exception) {
        Log.e(TAG, "startScanning failed", e)
        throw e
      }
    }

    Function("stopScanning") {
      Log.i(TAG, "stopScanning called from JS")
      scanner.stopScanning()
    }

    OnDestroy {
      Log.i(TAG, "OnDestroy: cleaning up")
      advertiser.stopAdvertising()
      scanner.stopScanning()
    }
  }

  private fun requireContext(): Context {
    val ctx = appContext.reactContext
    if (ctx == null) {
      Log.e(TAG, "React context is null!")
      throw IllegalStateException("React context not available")
    }
    Log.d(TAG, "Got React context: $ctx")
    return ctx
  }
}
