Pod::Spec.new do |s|
  s.name           = 'SwingAnalysis'
  s.version        = '0.1.0'
  s.summary        = 'Post-processing club shaft detection for swing analysis'
  s.description    = 'Expo native module that analyzes recorded swing clips using classical CV to detect and track the club shaft position throughout the swing.'
  s.homepage       = 'https://github.com/divotgolf/divot'
  s.license        = 'MIT'
  s.author         = 'Divot'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.frameworks     = 'AVFoundation', 'Accelerate', 'CoreMedia', 'CoreVideo'

  s.dependency 'ExpoModulesCore'
end
