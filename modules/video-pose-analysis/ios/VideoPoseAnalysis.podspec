Pod::Spec.new do |s|
  s.name           = 'VideoPoseAnalysis'
  s.version        = '0.1.0'
  s.summary        = 'Background video pose analysis using MediaPipe'
  s.description    = 'Extracts per-frame pose landmarks from recorded video clips'
  s.homepage       = 'https://github.com/divotgolf'
  s.license        = 'MIT'
  s.author         = 'Divot Golf'
  s.source         = { git: '' }

  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'

  s.source_files   = '**/*.swift'
  s.frameworks     = 'AVFoundation', 'CoreMedia', 'CoreVideo'

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '~> 0.10.14'

  s.resources      = ['pose_landmarker_lite.task']
end
