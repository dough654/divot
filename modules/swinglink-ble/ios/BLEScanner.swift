import CoreBluetooth
import Foundation

/// Scans for nearby SwingLink BLE advertisers and reads their payloads via GATT.
///
/// Discovery flow for each new peripheral:
///   1. `didDiscover` — cache RSSI, connect for GATT read
///   2. `didConnect` → `discoverServices` → `discoverCharacteristics` → `readValue`
///   3. Emit `onDeviceFound` with parsed payload, disconnect
///
/// Subsequent sightings of the same peripheral skip GATT (use cached payload),
/// re-emitting `onDeviceFound` with updated RSSI.
///
/// A staleness timer fires every 3 seconds. Devices not seen for 10 seconds
/// emit `onDeviceLost` and are purged from the cache.
class BLEScanner: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {

  /// Called when a device is discovered or its RSSI/lastSeen is updated.
  var onDeviceFound: (([String: Any]) -> Void)?
  /// Called when a device goes stale and is removed.
  var onDeviceLost: ((String) -> Void)?

  private var centralManager: CBCentralManager?
  private var stalenessTimer: Timer?

  // Peripherals currently undergoing GATT read (held to prevent dealloc)
  private var pendingPeripherals: [UUID: CBPeripheral] = [:]

  // Cache of successfully read devices: peripheral UUID -> device info dict
  private var readDevices: [UUID: [String: Any]] = [:]

  // Timestamp tracking for staleness
  private var lastSeenTimestamps: [UUID: TimeInterval] = [:]

  // RSSI cache for peripherals (updated on every advertisement)
  private var rssiCache: [UUID: NSNumber] = [:]

  private let stalenessInterval: TimeInterval = 3.0
  private let stalenessThreshold: TimeInterval = 10.0

  /// Starts scanning for SwingLink BLE advertisers.
  func startScanning() {
    if centralManager == nil {
      centralManager = CBCentralManager(delegate: self, queue: nil)
    } else if centralManager?.state == .poweredOn {
      beginScanning()
    }
  }

  /// Stops scanning, cancels pending GATT connections, and clears all caches.
  func stopScanning() {
    stalenessTimer?.invalidate()
    stalenessTimer = nil

    centralManager?.stopScan()

    for (_, peripheral) in pendingPeripherals {
      centralManager?.cancelPeripheralConnection(peripheral)
    }

    pendingPeripherals.removeAll()
    readDevices.removeAll()
    lastSeenTimestamps.removeAll()
    rssiCache.removeAll()
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      beginScanning()
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let peripheralId = peripheral.identifier
    let now = Date().timeIntervalSince1970

    rssiCache[peripheralId] = RSSI
    lastSeenTimestamps[peripheralId] = now

    // If we already have a cached read for this device, re-emit with updated RSSI
    if var cached = readDevices[peripheralId] {
      cached["rssi"] = RSSI.intValue
      cached["lastSeen"] = now * 1000 // JS uses milliseconds
      readDevices[peripheralId] = cached
      onDeviceFound?(cached)
      return
    }

    // If already connecting/reading, skip
    if pendingPeripherals[peripheralId] != nil {
      return
    }

    // New peripheral — connect for GATT characteristic read
    pendingPeripherals[peripheralId] = peripheral
    peripheral.delegate = self
    central.connect(peripheral, options: nil)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([BLEConstants.serviceUUID])
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    pendingPeripherals.removeValue(forKey: peripheral.identifier)
  }

  // MARK: - CBPeripheralDelegate

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil,
          let service = peripheral.services?.first(where: { $0.uuid == BLEConstants.serviceUUID })
    else {
      cleanupPeripheral(peripheral)
      return
    }
    peripheral.discoverCharacteristics([BLEConstants.payloadCharacteristicUUID], for: service)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    guard error == nil,
          let characteristic = service.characteristics?.first(where: {
            $0.uuid == BLEConstants.payloadCharacteristicUUID
          })
    else {
      cleanupPeripheral(peripheral)
      return
    }
    peripheral.readValue(for: characteristic)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    defer { cleanupPeripheral(peripheral) }

    guard error == nil,
          let data = characteristic.value,
          let payload = BLEConstants.unpackPayload(data)
    else { return }

    let peripheralId = peripheral.identifier
    let rssi = rssiCache[peripheralId]?.intValue ?? -100
    let now = Date().timeIntervalSince1970

    let deviceInfo: [String: Any] = [
      "id": peripheralId.uuidString,
      "name": peripheral.name as Any,
      "platform": payload.platform,
      "roomCode": payload.roomCode,
      "rssi": rssi,
      "lastSeen": now * 1000,
    ]

    readDevices[peripheralId] = deviceInfo
    lastSeenTimestamps[peripheralId] = now
    onDeviceFound?(deviceInfo)
  }

  // MARK: - Private

  private func beginScanning() {
    centralManager?.scanForPeripherals(
      withServices: [BLEConstants.serviceUUID],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
    )
    startStalenessTimer()
  }

  private func cleanupPeripheral(_ peripheral: CBPeripheral) {
    centralManager?.cancelPeripheralConnection(peripheral)
    pendingPeripherals.removeValue(forKey: peripheral.identifier)
  }

  private func startStalenessTimer() {
    stalenessTimer?.invalidate()
    stalenessTimer = Timer.scheduledTimer(withTimeInterval: stalenessInterval, repeats: true) {
      [weak self] _ in
      self?.pruneStaleDevices()
    }
  }

  private func pruneStaleDevices() {
    let now = Date().timeIntervalSince1970
    var staleIds: [UUID] = []

    for (id, lastSeen) in lastSeenTimestamps {
      if now - lastSeen > stalenessThreshold {
        staleIds.append(id)
      }
    }

    for id in staleIds {
      let idString = readDevices[id]?["id"] as? String ?? id.uuidString
      readDevices.removeValue(forKey: id)
      lastSeenTimestamps.removeValue(forKey: id)
      rssiCache.removeValue(forKey: id)
      if let pending = pendingPeripherals.removeValue(forKey: id) {
        centralManager?.cancelPeripheralConnection(pending)
      }
      onDeviceLost?(idString)
    }
  }
}
