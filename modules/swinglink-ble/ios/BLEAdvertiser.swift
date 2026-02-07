import CoreBluetooth
import Foundation

/// Manages BLE advertising with a GATT service for SwingLink device discovery.
///
/// CoreBluetooth doesn't allow arbitrary service data in advertisements, so we host
/// a GATT service with a readable characteristic containing the payload. Scanners
/// connect briefly, read the characteristic, then disconnect.
class BLEAdvertiser: NSObject, CBPeripheralManagerDelegate {
  private var peripheralManager: CBPeripheralManager?
  private var payloadCharacteristic: CBMutableCharacteristic?
  private var payloadData: Data?
  private var pendingRoomCode: String?

  /// Starts advertising with the given room code.
  /// If Bluetooth isn't powered on yet, the start is queued until it is.
  func startAdvertising(roomCode: String) {
    payloadData = BLEConstants.packPayload(roomCode: roomCode)

    if let manager = peripheralManager {
      if manager.state == .poweredOn {
        beginAdvertising()
      } else {
        pendingRoomCode = roomCode
      }
    } else {
      pendingRoomCode = roomCode
      peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
    }
  }

  /// Stops advertising and tears down the GATT service.
  func stopAdvertising() {
    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    payloadCharacteristic = nil
    payloadData = nil
    pendingRoomCode = nil
  }

  // MARK: - CBPeripheralManagerDelegate

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn && pendingRoomCode != nil {
      pendingRoomCode = nil
      beginAdvertising()
    }
  }

  func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveRead request: CBATTRequest
  ) {
    guard request.characteristic.uuid == BLEConstants.payloadCharacteristicUUID,
          let data = payloadData else {
      peripheral.respond(to: request, withResult: .attributeNotFound)
      return
    }

    if request.offset >= data.count {
      peripheral.respond(to: request, withResult: .invalidOffset)
      return
    }

    request.value = data.subdata(in: request.offset..<data.count)
    peripheral.respond(to: request, withResult: .success)
  }

  // MARK: - Private

  private func beginAdvertising() {
    guard let manager = peripheralManager else { return }

    // Create the readable characteristic
    let characteristic = CBMutableCharacteristic(
      type: BLEConstants.payloadCharacteristicUUID,
      properties: .read,
      value: nil, // Dynamic value served via didReceiveRead
      permissions: .readable
    )
    payloadCharacteristic = characteristic

    // Create and publish the GATT service
    let service = CBMutableService(type: BLEConstants.serviceUUID, primary: true)
    service.characteristics = [characteristic]
    manager.add(service)

    // Start advertising with the service UUID
    manager.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [BLEConstants.serviceUUID],
      CBAdvertisementDataLocalNameKey: "SwingLink",
    ])
  }
}
