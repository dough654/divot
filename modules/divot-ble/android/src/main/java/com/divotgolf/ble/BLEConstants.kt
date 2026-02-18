package com.divotgolf.ble

import android.os.ParcelUuid
import java.util.UUID

/** Shared BLE constants and payload helpers for Divot device discovery. */
object BLEConstants {
  val SERVICE_UUID: UUID = UUID.fromString("a5a50001-c6b8-4f18-b4c1-7e3f5a9b0d12")
  val PAYLOAD_CHARACTERISTIC_UUID: UUID = UUID.fromString("a5a50002-c6b8-4f18-b4c1-7e3f5a9b0d12")
  val SERVICE_PARCEL_UUID = ParcelUuid(SERVICE_UUID)

  const val PAYLOAD_LENGTH = 8
  const val ROOM_CODE_LENGTH = 6

  const val PLATFORM_IOS: Byte = 0x01
  const val PLATFORM_ANDROID: Byte = 0x02
  const val PROTOCOL_VERSION: Byte = 1

  /** Packs a room code into an 8-byte BLE payload. */
  fun packPayload(roomCode: String): ByteArray {
    val bytes = ByteArray(PAYLOAD_LENGTH)

    bytes[0] = PLATFORM_ANDROID

    val truncated = roomCode.take(ROOM_CODE_LENGTH)
    for (i in truncated.indices) {
      bytes[1 + i] = truncated[i].code.toByte()
    }

    bytes[7] = ((PROTOCOL_VERSION.toInt() shl 4) or 0x00).toByte()

    return bytes
  }

  /** Unpacks an 8-byte BLE payload. Returns null if data is invalid. */
  fun unpackPayload(data: ByteArray): Triple<String, String, Byte>? {
    if (data.size < PAYLOAD_LENGTH) return null

    val platform = when (data[0]) {
      PLATFORM_IOS -> "ios"
      PLATFORM_ANDROID -> "android"
      else -> return null
    }

    val roomCodeBuilder = StringBuilder()
    for (i in 1..ROOM_CODE_LENGTH) {
      val byte = data[i]
      if (byte == 0x00.toByte()) break
      roomCodeBuilder.append(byte.toInt().toChar())
    }

    val roomCode = roomCodeBuilder.toString()
    if (roomCode.isEmpty()) return null

    return Triple(platform, roomCode, data[7])
  }
}
