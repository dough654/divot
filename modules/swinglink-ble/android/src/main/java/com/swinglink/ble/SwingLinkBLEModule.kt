package com.swinglink.ble

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Thin Expo Module wiring for SwingLink BLE advertising and scanning. */
class SwingLinkBLEModule : Module() {

  private val advertiser by lazy {
    BLEAdvertiser(requireContext())
  }

  private val scanner by lazy {
    BLEScanner(requireContext()).also { scanner ->
      scanner.onDeviceFound = { deviceInfo ->
        sendEvent("onDeviceFound", deviceInfo)
      }
      scanner.onDeviceLost = { deviceId ->
        sendEvent("onDeviceLost", mapOf("id" to deviceId))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SwingLinkBLE")

    Events("onDeviceFound", "onDeviceLost")

    Function("startAdvertising") { roomCode: String ->
      advertiser.startAdvertising(roomCode)
    }

    Function("stopAdvertising") {
      advertiser.stopAdvertising()
    }

    Function("startScanning") {
      scanner.startScanning()
    }

    Function("stopScanning") {
      scanner.stopScanning()
    }

    OnDestroy {
      advertiser.stopAdvertising()
      scanner.stopScanning()
    }
  }

  private fun requireContext(): Context {
    return appContext.reactContext
      ?: throw IllegalStateException("React context not available")
  }
}
