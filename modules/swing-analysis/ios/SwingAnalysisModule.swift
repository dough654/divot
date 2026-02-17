import ExpoModulesCore
import os.log

private let logger = Logger(subsystem: "com.swinglink.analysis", category: "SwingAnalysisModule")

public class SwingAnalysisModule: Module {
    private let analysisQueue = DispatchQueue(label: "com.swinglink.analysis.pipeline", qos: .userInitiated)
    private var currentPipeline: ShaftDetectionPipeline?

    public func definition() -> ModuleDefinition {
        Name("SwingAnalysis")

        Events("onAnalysisProgress")

        AsyncFunction("analyzeClip") { (filePath: String, clipId: String) -> [String: Any] in
            logger.info("analyzeClip called: clipId=\(clipId), path=\(filePath)")

            // Normalize path to URL
            let url: URL
            if filePath.hasPrefix("file://") {
                guard let parsed = URL(string: filePath) else {
                    throw AnalysisError.noVideoTrack
                }
                url = parsed
            } else {
                url = URL(fileURLWithPath: filePath)
            }

            // Run on background queue
            return try await withCheckedThrowingContinuation { continuation in
                self.analysisQueue.async {
                    do {
                        let pipeline = try ShaftDetectionPipeline(url: url)
                        self.currentPipeline = pipeline

                        pipeline.onProgress = { [weak self] progress, currentFrame, totalFrames in
                            self?.sendEvent("onAnalysisProgress", [
                                "progress": progress,
                                "currentFrame": currentFrame,
                                "totalFrames": totalFrames,
                            ])
                        }

                        let result = try pipeline.run(clipId: clipId)
                        self.currentPipeline = nil
                        continuation.resume(returning: result)
                    } catch {
                        self.currentPipeline = nil
                        logger.error("Analysis failed: \(error.localizedDescription)")
                        continuation.resume(throwing: error)
                    }
                }
            }
        }

        Function("cancelAnalysis") {
            logger.info("cancelAnalysis called")
            self.currentPipeline?.isCancelled = true
        }

        OnDestroy {
            logger.info("OnDestroy: cancelling any running analysis")
            self.currentPipeline?.isCancelled = true
            self.currentPipeline = nil
        }
    }
}
