import CoreGraphics
import os.log

private let logger = Logger(subsystem: "com.divotgolf.analysis", category: "FrameDifferencer")

/// Computes motion masks by differencing consecutive grayscale frames.
final class FrameDifferencer {
    private var previousGrayscale: [UInt8]?

    /// Pixel intensity change threshold (0-255) to count as motion.
    private let threshold: UInt8 = 30

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

    /// Computes a binary motion mask by diffing the current grayscale frame
    /// against the previous one. Returns nil on the first frame (no previous).
    /// Each pixel in the result is 1 (motion) or 0 (static).
    func computeMotionMask(_ grayscale: [UInt8]) -> [UInt8]? {
        defer { previousGrayscale = grayscale }

        guard let previous = previousGrayscale else {
            return nil
        }

        guard previous.count == grayscale.count else {
            logger.warning("Frame size mismatch: \(previous.count) vs \(grayscale.count)")
            return nil
        }

        var mask = [UInt8](repeating: 0, count: grayscale.count)
        for i in 0..<grayscale.count {
            let diff = grayscale[i] > previous[i]
                ? grayscale[i] - previous[i]
                : previous[i] - grayscale[i]
            mask[i] = diff > threshold ? 1 : 0
        }

        return mask
    }

    /// Resets the differencer state (e.g., between analyses).
    func reset() {
        previousGrayscale = nil
    }
}
