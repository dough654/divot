Pod::Spec.new do |s|
  s.name           = 'DivotMultipeer'
  s.version        = '0.1.0'
  s.summary        = 'MultipeerConnectivity signaling relay for Divot iOS-to-iOS pairing'
  s.description    = 'Expo native module that uses Apple MultipeerConnectivity to relay WebRTC signaling messages between nearby iOS devices.'
  s.homepage       = 'https://github.com/divotgolf/divot'
  s.license        = 'MIT'
  s.author         = 'Divot'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MultipeerConnectivity'
end
