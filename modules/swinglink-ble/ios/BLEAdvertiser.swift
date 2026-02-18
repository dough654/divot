import CoreBluetooth
import Foundation
import os.log

private let logger = Logger(subsystem: "com.swinglink.ble", category: "BLEAdvertiser")

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
  private var serviceAdded = false

  /// Starts advertising with the given room code.
  /// If Bluetooth isn't powered on yet, the start is queued until it is.
  func startAdvertising(roomCode: String) {
    logger.info("startAdvertising called with roomCode=\(roomCode)")
    payloadData = BLEConstants.packPayload(roomCode: roomCode)

    if let manager = peripheralManager {
      if manager.state == .poweredOn {
        addServiceAndAdvertise(manager: manager)
      } else {
        logger.info("BT not powered on yet, queuing start (state=\(manager.state.rawValue))")
        pendingRoomCode = roomCode
      }
    } else {
      pendingRoomCode = roomCode
      peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
      logger.info("Created CBPeripheralManager, waiting for poweredOn")
    }
  }

  /// Stops advertising and tears down the GATT service.
  func stopAdvertising() {
    logger.info("stopAdvertising called")
    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    payloadCharacteristic = nil
    payloadData = nil
    pendingRoomCode = nil
    serviceAdded = false
  }

  // MARK: - CBPeripheralManagerDelegate

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    logger.info("peripheralManagerDidUpdateState: \(peripheral.state.rawValue)")
    if peripheral.state == .poweredOn && pendingRoomCode != nil {
      pendingRoomCode = nil
      addServiceAndAdvertise(manager: peripheral)
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error = error {
      logger.error("Failed to add GATT service: \(error.localizedDescription)")
      return
    }
    logger.info("GATT service added successfully, starting advertisement")
    serviceAdded = true

    // Now that the GATT service is registered, start advertising
    peripheral.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [BLEConstants.serviceUUID],
      CBAdvertisementDataLocalNameKey: "Divot",
    ])
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    if let error = error {
      logger.error("Failed to start advertising: \(error.localizedDescription)")
    } else {
      logger.info("Advertising started successfully")
    }
  }

  func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveRead request: CBATTRequest
  ) {
    logger.info("GATT read request from remote device (characteristic=\(request.characteristic.uuid))")
    guard request.characteristic.uuid == BLEConstants.payloadCharacteristicUUID,
          let data = payloadData else {
      logger.warning("Rejecting read: wrong characteristic or no payload data")
      peripheral.respond(to: request, withResult: .attributeNotFound)
      return
    }

    if request.offset >= data.count {
      peripheral.respond(to: request, withResult: .invalidOffset)
      return
    }

    request.value = data.subdata(in: request.offset..<data.count)
    peripheral.respond(to: request, withResult: .success)
    logger.info("Responded to GATT read with \(data.count) bytes")
  }

  // MARK: - Private

  private func addServiceAndAdvertise(manager: CBPeripheralManager) {
    // Remove any previous service first
    manager.removeAllServices()
    serviceAdded = false

    // Create the readable characteristic
    let characteristic = CBMutableCharacteristic(
      type: BLEConstants.payloadCharacteristicUUID,
      properties: .read,
      value: nil, // Dynamic value served via didReceiveRead
      permissions: .readable
    )
    payloadCharacteristic = characteristic

    // Create and publish the GATT service (async — advertising starts in didAdd callback)
    let service = CBMutableService(type: BLEConstants.serviceUUID, primary: true)
    service.characteristics = [characteristic]
    logger.info("Adding GATT service...")
    manager.add(service)
  }
}
