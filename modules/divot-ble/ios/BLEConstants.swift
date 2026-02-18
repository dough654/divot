import CoreBluetooth
import Foundation

/// Shared BLE constants and payload helpers for Divot device discovery.
enum BLEConstants {
  static let serviceUUID = CBUUID(string: "a5a50001-c6b8-4f18-b4c1-7e3f5a9b0d12")
  static let payloadCharacteristicUUID = CBUUID(string: "a5a50002-c6b8-4f18-b4c1-7e3f5a9b0d12")

  static let payloadLength = 8
  static let roomCodeLength = 6

  static let platformIOS: UInt8 = 0x01
  static let platformAndroid: UInt8 = 0x02
  static let protocolVersion: UInt8 = 1

  /// Packs a room code into an 8-byte BLE payload.
  static func packPayload(roomCode: String) -> Data {
    var bytes = [UInt8](repeating: 0, count: payloadLength)

    bytes[0] = platformIOS

    let truncated = String(roomCode.prefix(roomCodeLength))
    for (i, char) in truncated.utf8.enumerated() {
      bytes[1 + i] = char
    }

    bytes[7] = (protocolVersion << 4) | 0x00

    return Data(bytes)
  }

  /// Unpacks an 8-byte BLE payload. Returns nil if data is invalid.
  static func unpackPayload(_ data: Data) -> (platform: String, roomCode: String, flags: UInt8)? {
    guard data.count >= payloadLength else { return nil }

    let platformByte = data[0]
    let platform: String
    switch platformByte {
    case platformIOS: platform = "ios"
    case platformAndroid: platform = "android"
    default: return nil
    }

    var roomCode = ""
    for i in 1...roomCodeLength {
      let byte = data[i]
      if byte == 0x00 { break }
      roomCode.append(Character(UnicodeScalar(byte)))
    }

    guard !roomCode.isEmpty else { return nil }

    return (platform: platform, roomCode: roomCode, flags: data[7])
  }
}
