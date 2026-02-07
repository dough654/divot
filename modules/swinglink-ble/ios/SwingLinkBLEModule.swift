import ExpoModulesCore

/// Thin Expo Module wiring for SwingLink BLE advertising and scanning.
public class SwingLinkBLEModule: Module {
  private let advertiser = BLEAdvertiser()
  private let scanner = BLEScanner()

  public func definition() -> ModuleDefinition {
    Name("SwingLinkBLE")

    Events("onDeviceFound", "onDeviceLost")

    OnCreate {
      self.scanner.onDeviceFound = { [weak self] deviceInfo in
        self?.sendEvent("onDeviceFound", deviceInfo)
      }
      self.scanner.onDeviceLost = { [weak self] deviceId in
        self?.sendEvent("onDeviceLost", ["id": deviceId])
      }
    }

    Function("startAdvertising") { (roomCode: String) in
      self.advertiser.startAdvertising(roomCode: roomCode)
    }

    Function("stopAdvertising") {
      self.advertiser.stopAdvertising()
    }

    Function("startScanning") {
      self.scanner.startScanning()
    }

    Function("stopScanning") {
      self.scanner.stopScanning()
    }

    OnDestroy {
      self.advertiser.stopAdvertising()
      self.scanner.stopScanning()
    }
  }
}
