import ExpoModulesCore
import os.log

private let logger = Logger(subsystem: "com.divotgolf.videoposeanalysis", category: "VideoPoseAnalysisModule")

public class VideoPoseAnalysisModule: Module {
    private var currentPipeline: VideoPosePipeline?

    public func definition() -> ModuleDefinition {
        Name("VideoPoseAnalysis")

        Events("onPoseAnalysisProgress")

        AsyncFunction("analyzeVideo") { (filePath: String, clipId: String) -> [String: Any] in
            logger.info("analyzeVideo called: clipId=\(clipId), path=\(filePath)")

            let url: URL
            if filePath.hasPrefix("file://") {
                guard let parsed = URL(string: filePath) else {
                    throw VideoPoseError.noVideoTrack
                }
                url = parsed
            } else {
                url = URL(fileURLWithPath: filePath)
            }

            let pipeline = try VideoPosePipeline(url: url)
            self.currentPipeline = pipeline

            pipeline.onProgress = { [weak self] progress, currentFrame, totalFrames in
                DispatchQueue.main.async {
                    self?.sendEvent("onPoseAnalysisProgress", [
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
