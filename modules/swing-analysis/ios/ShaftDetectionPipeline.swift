import Foundation
import os.log

private let logger = Logger(subsystem: "com.swinglink.analysis", category: "ShaftDetectionPipeline")

/// Result dictionary keys matching the TypeScript SwingAnalysisResult type.
typealias AnalysisResultDict = [String: Any]

/// Orchestrates the full shaft detection pipeline across all frames of a video.
final class ShaftDetectionPipeline {
    private let extractor: FrameExtractor
    private let differencer = FrameDifferencer()
    private let componentFinder = ConnectedComponents(minArea: 20)
    private let momentCalculator = ImageMoments()
    private let candidateFilter = ShaftCandidateFilter()

    /// Called every N frames with progress (0-1), currentFrame, totalFrames.
    var onProgress: ((Double, Int, Int) -> Void)?

    /// Set to true to cancel processing between frames.
    var isCancelled = false

    /// How often to report progress (every N frames).
    private let progressInterval = 5

    init(url: URL) throws {
        extractor = try FrameExtractor(url: url)
    }

    /// Runs the full pipeline and returns a result dictionary.
    func run(clipId: String) throws -> AnalysisResultDict {
        let startTime = CFAbsoluteTimeGetCurrent()
        let totalFrames = extractor.totalFrames
        let analysisSize = extractor.analysisSize
        let imageWidth = Int(analysisSize.width)
        let imageHeight = Int(analysisSize.height)

        logger.info("Starting pipeline: \(totalFrames) frames, \(imageWidth)x\(imageHeight)")

        differencer.reset()
        candidateFilter.reset()

        var frameResults: [[String: Any]] = []

        for frameIndex in 0..<totalFrames {
            // Check cancellation
            if isCancelled {
                logger.info("Analysis cancelled at frame \(frameIndex)")
                throw AnalysisError.cancelled
            }

            // Report progress
            if frameIndex % progressInterval == 0 {
                let progress = Double(frameIndex) / Double(totalFrames)
                onProgress?(progress, frameIndex, totalFrames)
            }

            // Extract frame
            guard let (cgImage, actualTime) = extractor.extractFrame(at: frameIndex) else {
                continue
            }

            let timestampMs = CMTimeGetSeconds(actualTime) * 1000.0

            // Convert to grayscale
            let grayscale = differencer.toGrayscale(cgImage)

            // Compute motion mask (nil on first frame)
            guard let motionMask = differencer.computeMotionMask(grayscale) else {
                continue
            }

            // Find connected components
            let components = componentFinder.find(
                mask: motionMask,
                width: imageWidth,
                height: imageHeight
            )

            if components.isEmpty { continue }

            // Compute moments for each component
            let moments = components.map { momentCalculator.compute(component: $0) }

            // Select best shaft candidate
            guard let shaft = candidateFilter.selectBest(
                components: components,
                moments: moments,
                imageWidth: imageWidth,
                imageHeight: imageHeight
            ) else { continue }

            let frameResult: [String: Any] = [
                "frameIndex": frameIndex,
                "timestampMs": timestampMs,
                "angleDegrees": shaft.angleDegrees,
                "startPoint": ["x": shaft.startX, "y": shaft.startY],
                "endPoint": ["x": shaft.endX, "y": shaft.endY],
                "confidence": shaft.confidence,
            ]

            frameResults.append(frameResult)
        }

        // Final progress
        onProgress?(1.0, totalFrames, totalFrames)

        let analysisTimeMs = (CFAbsoluteTimeGetCurrent() - startTime) * 1000.0

        logger.info("Pipeline complete: \(frameResults.count)/\(totalFrames) frames detected in \(Int(analysisTimeMs))ms")

        return [
            "clipId": clipId,
            "totalFrames": totalFrames,
            "frames": frameResults,
            "analysisTimeMs": analysisTimeMs,
            "analysisResolution": [
                "width": imageWidth,
                "height": imageHeight,
            ],
        ]
    }
}
