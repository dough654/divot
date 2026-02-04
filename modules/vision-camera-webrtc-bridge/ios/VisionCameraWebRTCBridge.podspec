require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'expo-module.config.json')))

Pod::Spec.new do |s|
  s.name           = 'VisionCameraWebRTCBridge'
  s.version        = '0.1.0'
  s.summary        = 'Bridges VisionCamera frames into a WebRTC video track'
  s.description    = 'Native Expo module that forwards VisionCamera frame processor frames to a WebRTC RTCVideoSource, enabling real-time P2P video streaming without crossing the JS bridge.'
  s.homepage       = 'https://github.com/swinglink/swing-app'
  s.license        = 'MIT'
  s.author         = 'SwingLink'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
  s.dependency 'JitsiWebRTC', '~> 124.0.0'
end
