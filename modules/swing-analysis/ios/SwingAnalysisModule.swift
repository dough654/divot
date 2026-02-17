import ExpoModulesCore
import os.log

private let logger = Logger(subsystem: "com.swinglink.analysis", category: "SwingAnalysisModule")

public class SwingAnalysisModule: Module {
    private var currentPipeline: ShaftDetectionPipeline?

    public func definition() -> ModuleDefinition {
        Name("SwingAnalysis")

        Events("onAnalysisProgress")

        AsyncFunction("analyzeClip") { [weak self] (filePath: String, clipId: String) -> [String: Any] in
            guard let self else {
                throw AnalysisError.cancelled
            }

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

            let pipeline = try ShaftDetectionPipeline(url: url)
            self.currentPipeline = pipeline

            pipeline.onProgress = { [weak self] progress, currentFrame, totalFrames in
                DispatchQueue.main.async {
                    self?.sendEvent("onAnalysisProgress", [
                        "progress": progress,
                        "currentFrame": currentFrame,
                        "totalFrames": totalFrames,
                    ])
                }
            }

            let result = try pipeline.run(clipId: clipId)
            self.currentPipeline = nil
            return result
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
