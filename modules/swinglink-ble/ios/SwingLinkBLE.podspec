Pod::Spec.new do |s|
  s.name           = 'SwingLinkBLE'
  s.version        = '0.1.0'
  s.summary        = 'BLE advertising and scanning for SwingLink device discovery'
  s.description    = 'Expo native module that exposes BLE advertising (camera side) and scanning (viewer side) for nearby device pairing.'
  s.homepage       = 'https://github.com/swinglink/swing-app'
  s.license        = 'MIT'
  s.author         = 'SwingLink'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
end
