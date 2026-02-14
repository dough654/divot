import CoreVideo

/**
 * Computes luminance-based frame differencing from raw pixel data.
 *
 * Algorithm:
 * 1. Extract Y (luminance) plane from YUV frame buffer (plane 0)
 * 2. Downsample: every 4th pixel in both dimensions (~16x fewer pixels)
 * 3. Compute absolute difference from previous frame's luminance values
 * 4. Normalize: totalAbsDiff / (sampleCount * 255) → 0.0 to 1.0
 *
 * No OpenCV, no ML — just pixel math.
 */
class FrameDiffComputer {

  /// Previous frame's downsampled luminance values.
  private var previousLuminance: [UInt8]?

  /// Downsample stride — every Nth pixel in each dimension.
  private let stride = 4

  /**
   * Compute the motion magnitude between this frame and the previous one.
   *
   * - Parameter sampleBuffer: The camera frame's pixel buffer.
   * - Returns: Motion magnitude 0.0-1.0, or nil on the first frame.
   */
  func computeDiff(sampleBuffer: CMSampleBuffer) -> Double? {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return nil
    }

    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    // Get Y plane (plane 0 of YUV)
    guard let yPlaneBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else {
      return nil
    }

    let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
    let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
    let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    let yPlane = yPlaneBase.assumingMemoryBound(to: UInt8.self)

    // Downsample: extract every 4th pixel in both dimensions
    let sampledWidth = width / stride
    let sampledHeight = height / stride
    let sampleCount = sampledWidth * sampledHeight

    guard sampleCount > 0 else { return nil }

    var currentLuminance = [UInt8](repeating: 0, count: sampleCount)
    var idx = 0
    for row in Swift.stride(from: 0, to: height, by: stride) {
      let rowOffset = row * bytesPerRow
      for col in Swift.stride(from: 0, to: width, by: stride) {
        currentLuminance[idx] = yPlane[rowOffset + col]
        idx += 1
      }
    }

    guard let prevLuminance = previousLuminance, prevLuminance.count == sampleCount else {
      // First frame — store and return nil
      previousLuminance = currentLuminance
      return nil
    }

    // Compute absolute difference
    var totalDiff: UInt64 = 0
    for i in 0..<sampleCount {
      let diff = Int(currentLuminance[i]) - Int(prevLuminance[i])
      totalDiff += UInt64(abs(diff))
    }

    previousLuminance = currentLuminance

    // Normalize to 0.0-1.0
    let maxPossibleDiff = Double(sampleCount) * 255.0
    return Double(totalDiff) / maxPossibleDiff
  }
}
