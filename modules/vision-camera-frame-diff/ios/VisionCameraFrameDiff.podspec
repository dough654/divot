Pod::Spec.new do |s|
  s.name           = 'VisionCameraFrameDiff'
  s.version        = '0.1.0'
  s.summary        = 'Luminance-based frame differencing via VisionCamera frame processor'
  s.description    = 'Native Expo module that computes pixel-level frame differencing on VisionCamera frames. No ML, no Vision framework — just raw Y plane luminance diffs.'
  s.homepage       = 'https://github.com/divotgolf/divot'
  s.license        = 'MIT'
  s.author         = 'Divot'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
end
