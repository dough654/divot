package com.swinglink.wifidirect

/** Constants shared across Wi-Fi Direct components. */
object WifiDirectConstants {
  /** Bonjour/DNS-SD service type for SwingLink signaling. */
  const val SERVICE_TYPE = "_swinglink-sig._tcp"

  /** TXT record key for room code. */
  const val TXT_ROOM_CODE = "rc"

  /** TXT record key for TCP port. */
  const val TXT_PORT = "port"

  /** TXT record key for platform identifier. */
  const val TXT_PLATFORM = "pl"

  /** Platform value for Android. */
  const val PLATFORM_ANDROID = "android"

  /** Maximum TCP frame size (1 MB) to guard against malformed length prefixes. */
  const val MAX_FRAME_SIZE = 1_048_576

  /** TCP read/write timeout in milliseconds. */
  const val TCP_TIMEOUT_MS = 15_000
}
