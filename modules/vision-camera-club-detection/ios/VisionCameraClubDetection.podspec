Pod::Spec.new do |s|
  s.name           = 'VisionCameraClubDetection'
  s.version        = '0.1.0'
  s.summary        = 'On-device golf club detection via VisionCamera frame processor'
  s.description    = 'Native Expo module that runs a YOLOv8-nano-pose CoreML model on VisionCamera frames to detect golf club grip and head keypoints.'
  s.homepage       = 'https://github.com/swinglink/swing-app'
  s.license        = 'MIT'
  s.author         = 'SwingLink'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
  s.resources      = ['golf-club-pose.mlmodelc']

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'

  s.frameworks = 'CoreML', 'Vision'
end
