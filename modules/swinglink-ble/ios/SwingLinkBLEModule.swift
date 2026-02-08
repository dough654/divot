import ExpoModulesCore
import os.log

private let logger = Logger(subsystem: "com.swinglink.ble", category: "SwingLinkBLEModule")

/// Thin Expo Module wiring for SwingLink BLE advertising and scanning.
public class SwingLinkBLEModule: Module {
  private let advertiser = BLEAdvertiser()
  private let scanner = BLEScanner()

  public func definition() -> ModuleDefinition {
    Name("SwingLinkBLE")

    Events("onDeviceFound", "onDeviceLost")

    OnCreate {
      logger.info("OnCreate: wiring scanner callbacks")
      self.scanner.onDeviceFound = { [weak self] deviceInfo in
        logger.info("Forwarding onDeviceFound to JS: \(deviceInfo["id"] as? String ?? "?")")
        self?.sendEvent("onDeviceFound", deviceInfo)
      }
      self.scanner.onDeviceLost = { [weak self] deviceId in
        logger.info("Forwarding onDeviceLost to JS: \(deviceId)")
        self?.sendEvent("onDeviceLost", ["id": deviceId])
      }
    }

    Function("startAdvertising") { (roomCode: String) in
      logger.info("startAdvertising called from JS with roomCode=\(roomCode)")
      self.advertiser.startAdvertising(roomCode: roomCode)
    }

    Function("stopAdvertising") {
      logger.info("stopAdvertising called from JS")
      self.advertiser.stopAdvertising()
    }

    Function("startScanning") {
      logger.info("startScanning called from JS")
      self.scanner.startScanning()
    }

    Function("stopScanning") {
      logger.info("stopScanning called from JS")
      self.scanner.stopScanning()
    }

    OnDestroy {
      logger.info("OnDestroy: cleaning up")
      self.advertiser.stopAdvertising()
      self.scanner.stopScanning()
    }
  }
}
