#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>

#if __has_include("VisionCameraWebRTCBridge-Swift.h")
#import "VisionCameraWebRTCBridge-Swift.h"
#else
#import <VisionCameraWebRTCBridge/VisionCameraWebRTCBridge-Swift.h>
#endif

@interface WebRTCFrameProcessorPlugin : FrameProcessorPlugin
@end

@implementation WebRTCFrameProcessorPlugin

- (instancetype)initWithProxy:(VisionCameraProxyHolder*)proxy
                  withOptions:(NSDictionary* _Nullable)options {
  self = [super initWithProxy:proxy withOptions:options];
  return self;
}

- (id _Nullable)callback:(Frame*)frame
           withArguments:(NSDictionary* _Nullable)arguments {
  CMSampleBufferRef buffer = frame.buffer;
  if (buffer != NULL) {
    // Forward to the singleton forwarder
    // Swift class is accessed via the generated header
    [VisionCameraFrameForwarder.shared pushFrameWithSampleBuffer:buffer];
  }
  return nil;
}

VISION_EXPORT_FRAME_PROCESSOR(WebRTCFrameProcessorPlugin, forwardToWebRTC)

@end
