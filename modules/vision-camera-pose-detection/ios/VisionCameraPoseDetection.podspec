Pod::Spec.new do |s|
  s.name           = 'VisionCameraPoseDetection'
  s.version        = '0.2.0'
  s.summary        = 'On-device pose detection via VisionCamera frame processor'
  s.description    = 'Native Expo module that runs MediaPipe Pose Landmarker on VisionCamera frames and returns a flat array of 14 joint positions.'
  s.homepage       = 'https://github.com/swinglink/swing-app'
  s.license        = 'MIT'
  s.author         = 'SwingLink'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  # Exclude the old Apple Vision detector (replaced by MediaPipePoseDetector)
  s.exclude_files  = '**/AppleVisionPoseDetector.swift'

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
  s.dependency 'MediaPipeTasksVision', '~> 0.10.14'

  # Bundle the MediaPipe pose landmarker model file
  s.resource_bundles = {
    'VisionCameraPoseDetection' => ['pose_landmarker_lite.task']
  }
end
