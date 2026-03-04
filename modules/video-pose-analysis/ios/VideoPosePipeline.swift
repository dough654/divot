import CoreMedia
import Foundation
import os.log

private let logger = Logger(subsystem: "com.divotgolf.videoposeanalysis", category: "VideoPosePipeline")

/// Orchestrates frame extraction → pose detection across all frames of a video.
/// Returns a result dictionary matching the TypeScript VideoPoseAnalysisResult type.
final class VideoPosePipeline {
    private let extractor: VideoFrameExtractor
    private let detector: VideoPoseDetector

    /// Called every N frames with progress (0-1), currentFrame, totalFrames.
    var onProgress: ((Double, Int, Int) -> Void)?

    /// Set to true to cancel processing between frames.
    var isCancelled = false

    /// How often to report progress (every N frames).
    private let progressInterval = 10

    init(url: URL) throws {
        extractor = try VideoFrameExtractor(url: url)
        detector = VideoPoseDetector()

        guard detector.isReady else {
            throw VideoPoseError.modelNotAvailable
        }
    }

    /// Runs pose detection on every frame and returns results.
    func run(clipId: String) throws -> [String: Any] {
        let startTime = CFAbsoluteTimeGetCurrent()
        let totalFrames = extractor.totalFrames
        let fps = extractor.frameRate

        var imageWidth = 0
        var imageHeight = 0

        logger.info("Starting pose pipeline: \(totalFrames) frames at \(fps) fps")

        var frameResults: [[String: Any]] = []

        for frameIndex in 0..<totalFrames {
            if isCancelled {
                logger.info("Analysis cancelled at frame \(frameIndex)")
                throw VideoPoseError.cancelled
            }

            if frameIndex % progressInterval == 0 {
                let progress = Double(frameIndex) / Double(totalFrames)
                onProgress?(progress, frameIndex, totalFrames)
            }

            guard let (cgImage, actualTime) = extractor.extractFrame(at: frameIndex) else {
                continue
            }

            if imageWidth == 0 {
                imageWidth = cgImage.width
                imageHeight = cgImage.height
                logger.info("Actual frame size: \(imageWidth)x\(imageHeight)")
            }

            let timestampMs = CMTimeGetSeconds(actualTime) * 1000.0

            guard let landmarks = detector.detectPose(in: cgImage) else {
                continue
            }

            let frameResult: [String: Any] = [
                "frameIndex": frameIndex,
                "timestampMs": timestampMs,
                "landmarks": landmarks,
            ]

            frameResults.append(frameResult)
        }

        // Final progress
        onProgress?(1.0, totalFrames, totalFrames)

        let analysisTimeMs = (CFAbsoluteTimeGetCurrent() - startTime) * 1000.0

        logger.info("Pose pipeline complete: \(frameResults.count)/\(totalFrames) frames detected in \(Int(analysisTimeMs))ms")

        return [
            "clipId": clipId,
            "totalFrames": totalFrames,
            "analyzedFrames": frameResults.count,
            "frames": frameResults,
            "analysisTimeMs": analysisTimeMs,
            "fps": fps,
            "resolution": [
                "width": imageWidth,
                "height": imageHeight,
            ],
        ]
    }
}
