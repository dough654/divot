import AVFoundation
import CoreMedia
import os.log

private let logger = Logger(subsystem: "com.swinglink.analysis", category: "FrameExtractor")

/// Extracts individual frames from a video file at precise timestamps.
final class FrameExtractor {
    let asset: AVURLAsset
    let generator: AVAssetImageGenerator
    let frameRate: Float
    let totalFrames: Int
    let naturalSize: CGSize

    /// Target height for downsampled frames (preserving aspect ratio).
    private static let targetHeight: CGFloat = 480

    init(url: URL) throws {
        asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])

        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            throw AnalysisError.noVideoTrack
        }

        frameRate = videoTrack.nominalFrameRate
        let duration = CMTimeGetSeconds(asset.duration)
        totalFrames = Int(ceil(Double(frameRate) * duration))
        naturalSize = videoTrack.naturalSize

        generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero

        // Downsample to ~480p height, preserving aspect ratio
        let scale = Self.targetHeight / naturalSize.height
        let targetWidth = round(naturalSize.width * scale)
        generator.maximumSize = CGSize(width: targetWidth, height: Self.targetHeight)

        logger.info("FrameExtractor: \(self.totalFrames) frames at \(self.frameRate) fps, natural=\(Int(self.naturalSize.width))x\(Int(self.naturalSize.height)), target=\(Int(targetWidth))x\(Int(Self.targetHeight))")
    }

    /// The actual resolution of extracted frames after downsampling.
    var analysisSize: CGSize {
        let scale = Self.targetHeight / naturalSize.height
        let targetWidth = round(naturalSize.width * scale)
        return CGSize(width: targetWidth, height: Self.targetHeight)
    }

    /// Extracts a single frame at the given index.
    /// Returns the CGImage and its actual timestamp, or nil on failure.
    func extractFrame(at index: Int) -> (CGImage, CMTime)? {
        let time = CMTimeMakeWithSeconds(
            Double(index) / Double(frameRate),
            preferredTimescale: 600
        )

        var actualTime = CMTime.zero
        do {
            let cgImage = try generator.copyCGImage(at: time, actualTime: &actualTime)
            return (cgImage, actualTime)
        } catch {
            logger.warning("Failed to extract frame \(index): \(error.localizedDescription)")
            return nil
        }
    }
}

/// Errors specific to swing analysis.
enum AnalysisError: Error, LocalizedError {
    case noVideoTrack
    case cancelled

    var errorDescription: String? {
        switch self {
        case .noVideoTrack: return "Video file contains no video track"
        case .cancelled: return "Analysis was cancelled"
        }
    }
}
