import CoreGraphics
import os.log

private let logger = Logger(subsystem: "com.divotgolf.analysis", category: "FrameDifferencer")

/// Computes motion masks by differencing grayscale frames, with multi-frame
/// accumulation and morphological dilation to produce coherent motion blobs.
final class FrameDifferencer {
    /// Ring buffer of recent grayscale frames for multi-frame accumulation.
    private var recentFrames: [[UInt8]] = []

    /// Number of previous frames to accumulate motion across.
    private let accumulationWindow = 3

    /// Pixel intensity change threshold (0-255) to count as motion.
    private let threshold: UInt8 = 15

    /// Dilation radius in pixels (connects nearby motion pixels).
    private let dilationRadius = 2

    /// Converts a CGImage to a grayscale byte array using luminance weights.
    func toGrayscale(_ image: CGImage) -> [UInt8] {
        let width = image.width
        let height = image.height
        let pixelCount = width * height

        // Render to RGBA
        var rgba = [UInt8](repeating: 0, count: pixelCount * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: &rgba,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            logger.error("Failed to create CGContext for grayscale conversion")
            return [UInt8](repeating: 0, count: pixelCount)
        }

        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        // Convert to luminance: 0.299R + 0.587G + 0.114B
        var grayscale = [UInt8](repeating: 0, count: pixelCount)
        for i in 0..<pixelCount {
            let r = UInt16(rgba[i * 4])
            let g = UInt16(rgba[i * 4 + 1])
            let b = UInt16(rgba[i * 4 + 2])
            grayscale[i] = UInt8((r * 77 + g * 150 + b * 29) >> 8)
        }

        return grayscale
    }

    /// Computes a binary motion mask by diffing the current frame against
    /// recent frames (accumulating motion over a sliding window), then
    /// dilating to connect nearby motion pixels.
    /// Returns nil until at least one previous frame is available.
    func computeMotionMask(_ grayscale: [UInt8], width: Int, height: Int) -> [UInt8]? {
        defer {
            recentFrames.append(grayscale)
            if recentFrames.count > accumulationWindow {
                recentFrames.removeFirst()
            }
        }

        if recentFrames.isEmpty {
            return nil
        }

        let pixelCount = grayscale.count
        var mask = [UInt8](repeating: 0, count: pixelCount)

        // Accumulate: OR together diffs against each frame in the window
        for previous in recentFrames {
            guard previous.count == pixelCount else { continue }
            for i in 0..<pixelCount {
                if mask[i] != 0 { continue } // already marked
                let diff = grayscale[i] > previous[i]
                    ? grayscale[i] - previous[i]
                    : previous[i] - grayscale[i]
                if diff > threshold {
                    mask[i] = 1
                }
            }
        }

        // Dilate to connect nearby motion pixels
        return dilate(mask: mask, width: width, height: height, radius: dilationRadius)
    }

    /// Simple box dilation: for each motion pixel, set all neighbors within
    /// radius to motion.
    private func dilate(mask: [UInt8], width: Int, height: Int, radius: Int) -> [UInt8] {
        var dilated = [UInt8](repeating: 0, count: mask.count)

        for y in 0..<height {
            for x in 0..<width {
                if mask[y * width + x] == 0 { continue }

                // Set all pixels in the radius to 1
                let yMin = max(0, y - radius)
                let yMax = min(height - 1, y + radius)
                let xMin = max(0, x - radius)
                let xMax = min(width - 1, x + radius)

                for dy in yMin...yMax {
                    for dx in xMin...xMax {
                        dilated[dy * width + dx] = 1
                    }
                }
            }
        }

        return dilated
    }

    /// Resets the differencer state (e.g., between analyses).
    func reset() {
        recentFrames.removeAll()
    }
}
