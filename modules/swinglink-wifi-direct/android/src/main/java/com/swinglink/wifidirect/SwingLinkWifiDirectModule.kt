package com.swinglink.wifidirect

import android.content.Context
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Thin Expo Module wiring for SwingLink Wi-Fi Direct signaling. */
class SwingLinkWifiDirectModule : Module() {
  companion object {
    private const val TAG = "SwingLinkWifiDirect"
  }

  private val manager by lazy {
    Log.i(TAG, "Creating WifiDirectManager (lazy init)")
    WifiDirectManager(requireContext()).also { mgr ->
      mgr.onPeerConnected = {
        Log.i(TAG, "Forwarding onPeerConnected to JS")
        sendEvent("onPeerConnected", emptyMap<String, Any>())
      }
      mgr.onPeerDisconnected = {
        Log.i(TAG, "Forwarding onPeerDisconnected to JS")
        sendEvent("onPeerDisconnected", emptyMap<String, Any>())
      }
      mgr.onSignalingMessage = { message ->
        Log.i(TAG, "Forwarding onSignalingMessage to JS: type=${message["type"]}")
        sendEvent("onSignalingMessage", message)
      }
      mgr.onInvitationReceived = { peerName ->
        Log.i(TAG, "Forwarding onInvitationReceived to JS: peerName=$peerName")
        sendEvent("onInvitationReceived", mapOf("peerName" to peerName))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SwingLinkWifiDirect")

    Events("onPeerConnected", "onPeerDisconnected", "onSignalingMessage", "onInvitationReceived")

    Function("startAdvertising") { roomCode: String ->
      Log.i(TAG, "startAdvertising called from JS with roomCode=$roomCode")
      manager.startAdvertising(roomCode)
    }

    Function("startBrowsing") { roomCode: String ->
      Log.i(TAG, "startBrowsing called from JS with roomCode=$roomCode")
      manager.startBrowsing(roomCode)
    }

    Function("sendMessage") { type: String, payload: String ->
      Log.i(TAG, "sendMessage called from JS: type=$type")
      manager.sendMessage(type, payload)
    }

    Function("respondToInvitation") { accept: Boolean ->
      Log.i(TAG, "respondToInvitation called from JS: accept=$accept")
      manager.respondToInvitation(accept)
    }

    Function("disconnect") {
      Log.i(TAG, "disconnect called from JS")
      manager.disconnect()
    }

    OnDestroy {
      Log.i(TAG, "OnDestroy: cleaning up")
      manager.disconnect()
    }
  }

  private fun requireContext(): Context {
    val ctx = appContext.reactContext
    if (ctx == null) {
      Log.e(TAG, "React context is null!")
      throw IllegalStateException("React context not available")
    }
    return ctx
  }
}
