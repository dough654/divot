import Foundation

/// Result of computing image moments for a connected component.
struct MomentResult {
    let centroidX: Double
    let centroidY: Double
    /// Orientation angle in radians (-pi/2 to pi/2).
    let orientation: Double
    /// Elongation ratio (major axis / minor axis). Higher = more elongated.
    let elongation: Double
    let area: Int
}

/// Computes image moments (centroid, orientation, elongation) for connected components.
final class ImageMoments {
    /// Computes moments for a single connected component.
    func compute(component: Component) -> MomentResult {
        let n = Double(component.area)
        guard n > 0 else {
            return MomentResult(centroidX: 0, centroidY: 0, orientation: 0, elongation: 1, area: 0)
        }

        // Raw moments
        var m10: Double = 0
        var m01: Double = 0
        for (x, y) in component.pixels {
            m10 += Double(x)
            m01 += Double(y)
        }

        let cx = m10 / n
        let cy = m01 / n

        // Central moments
        var mu20: Double = 0
        var mu02: Double = 0
        var mu11: Double = 0
        for (x, y) in component.pixels {
            let dx = Double(x) - cx
            let dy = Double(y) - cy
            mu20 += dx * dx
            mu02 += dy * dy
            mu11 += dx * dy
        }

        // Orientation via atan2(2*mu11, mu20 - mu02)
        let orientation = 0.5 * atan2(2.0 * mu11, mu20 - mu02)

        // Eigenvalues of the covariance matrix for elongation
        let a = mu20 / n
        let b = mu11 / n
        let c = mu02 / n

        let discriminant = sqrt(max(0, (a - c) * (a - c) + 4 * b * b))
        let lambda1 = 0.5 * ((a + c) + discriminant)
        let lambda2 = 0.5 * ((a + c) - discriminant)

        let elongation: Double
        if lambda2 > 1e-6 {
            elongation = sqrt(lambda1 / lambda2)
        } else {
            elongation = lambda1 > 1e-6 ? 100.0 : 1.0
        }

        return MomentResult(
            centroidX: cx,
            centroidY: cy,
            orientation: orientation,
            elongation: elongation,
            area: component.area
        )
    }
}
