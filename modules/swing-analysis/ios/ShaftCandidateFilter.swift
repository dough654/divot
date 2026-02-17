import Foundation
import os.log

private let logger = Logger(subsystem: "com.swinglink.analysis", category: "ShaftCandidateFilter")

/// Result of selecting the best shaft candidate from connected components.
struct ShaftLineResult {
    let startX: Double
    let startY: Double
    let endX: Double
    let endY: Double
    let angleDegrees: Double
    let confidence: Double
}

/// Selects the best shaft-like blob from detected components and tracks it over time.
final class ShaftCandidateFilter {
    /// Minimum elongation ratio to qualify as a shaft.
    private let minElongation: Double = 3.0
    /// Maximum component area as a fraction of image area.
    private let maxAreaFraction: Double = 0.05
    /// Scoring weight for elongation quality.
    private let elongationWeight: Double = 0.7
    /// Scoring weight for upper-frame preference (DTL camera angle).
    private let positionWeight: Double = 0.3

    /// EMA smoothing factor for temporal consistency.
    private let emaAlpha: Double = 0.3
    private var previousAngle: Double?
    private var previousCentroidX: Double?
    private var previousCentroidY: Double?

    /// Selects the best shaft candidate from a list of components and their moments.
    /// Returns nil if no suitable candidate is found.
    func selectBest(
        components: [Component],
        moments: [MomentResult],
        imageWidth: Int,
        imageHeight: Int
    ) -> ShaftLineResult? {
        let imageArea = Double(imageWidth * imageHeight)
        let maxArea = imageArea * maxAreaFraction

        var bestScore: Double = -1
        var bestIndex: Int = -1

        for i in 0..<components.count {
            let moment = moments[i]

            // Filter: must be elongated enough
            guard moment.elongation >= minElongation else { continue }
            // Filter: not too large (probably not the shaft)
            guard Double(moment.area) <= maxArea else { continue }

            // Score: elongation quality (capped at 20 for normalization)
            let elongationScore = min(moment.elongation / 20.0, 1.0)

            // Score: prefer blobs in the upper portion of the frame (DTL angle)
            let normalizedY = moment.centroidY / Double(imageHeight)
            let positionScore = 1.0 - normalizedY // higher = more toward top

            let score = elongationWeight * elongationScore + positionWeight * positionScore

            if score > bestScore {
                bestScore = score
                bestIndex = i
            }
        }

        guard bestIndex >= 0 else { return nil }

        let component = components[bestIndex]
        let moment = moments[bestIndex]

        // Project pixels along the principal axis to find endpoints
        let cosA = cos(moment.orientation)
        let sinA = sin(moment.orientation)

        var minProj = Double.greatestFiniteMagnitude
        var maxProj = -Double.greatestFiniteMagnitude
        var minProjPixel: (x: Int, y: Int) = (0, 0)
        var maxProjPixel: (x: Int, y: Int) = (0, 0)

        for (px, py) in component.pixels {
            let dx = Double(px) - moment.centroidX
            let dy = Double(py) - moment.centroidY
            let proj = dx * cosA + dy * sinA

            if proj < minProj {
                minProj = proj
                minProjPixel = (px, py)
            }
            if proj > maxProj {
                maxProj = proj
                maxProjPixel = (px, py)
            }
        }

        // Normalize endpoints to 0-1
        var startX = Double(minProjPixel.x) / Double(imageWidth)
        var startY = Double(minProjPixel.y) / Double(imageHeight)
        var endX = Double(maxProjPixel.x) / Double(imageWidth)
        var endY = Double(maxProjPixel.y) / Double(imageHeight)

        // Compute angle in degrees (0 = horizontal, 90 = vertical)
        var angleDeg = abs(moment.orientation * 180.0 / .pi)

        // EMA temporal smoothing
        if let prevAngle = previousAngle,
           let prevCX = previousCentroidX,
           let prevCY = previousCentroidY {
            angleDeg = emaAlpha * angleDeg + (1.0 - emaAlpha) * prevAngle

            let smoothedCX = emaAlpha * moment.centroidX + (1.0 - emaAlpha) * prevCX
            let smoothedCY = emaAlpha * moment.centroidY + (1.0 - emaAlpha) * prevCY

            // Offset endpoints based on smoothed centroid shift
            let driftX = (smoothedCX - moment.centroidX) / Double(imageWidth)
            let driftY = (smoothedCY - moment.centroidY) / Double(imageHeight)
            startX += driftX
            startY += driftY
            endX += driftX
            endY += driftY
        }

        previousAngle = angleDeg
        previousCentroidX = moment.centroidX
        previousCentroidY = moment.centroidY

        // Confidence based on elongation (higher = more shaft-like)
        let confidence = min(moment.elongation / 15.0, 1.0)

        return ShaftLineResult(
            startX: startX,
            startY: startY,
            endX: endX,
            endY: endY,
            angleDegrees: angleDeg,
            confidence: confidence
        )
    }

    /// Resets temporal smoothing state.
    func reset() {
        previousAngle = nil
        previousCentroidX = nil
        previousCentroidY = nil
    }
}
