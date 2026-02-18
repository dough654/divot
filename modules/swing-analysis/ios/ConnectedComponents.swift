import os.log

private let logger = Logger(subsystem: "com.divotgolf.analysis", category: "ConnectedComponents")

/// A connected region of pixels in a binary mask.
struct Component {
    /// Pixel coordinates in the component.
    var pixels: [(x: Int, y: Int)]

    var area: Int { pixels.count }
}

/// Finds connected components in a binary mask using 8-connectivity BFS.
final class ConnectedComponents {
    /// Minimum number of pixels for a component to be kept.
    private let minArea: Int

    init(minArea: Int = 10) {
        self.minArea = minArea
    }

    /// Finds all connected components in the binary mask above the minimum area.
    func find(mask: [UInt8], width: Int, height: Int) -> [Component] {
        var visited = [Bool](repeating: false, count: width * height)
        var components: [Component] = []

        // BFS queue, pre-allocated
        var queue: [(x: Int, y: Int)] = []
        queue.reserveCapacity(1024)

        for y in 0..<height {
            for x in 0..<width {
                let idx = y * width + x
                if mask[idx] == 0 || visited[idx] { continue }

                // BFS flood fill
                queue.removeAll(keepingCapacity: true)
                queue.append((x, y))
                visited[idx] = true
                var pixels: [(x: Int, y: Int)] = []
                var head = 0

                while head < queue.count {
                    let (cx, cy) = queue[head]
                    head += 1
                    pixels.append((cx, cy))

                    // 8-connectivity neighbors
                    for dy in -1...1 {
                        for dx in -1...1 {
                            if dx == 0 && dy == 0 { continue }
                            let nx = cx + dx
                            let ny = cy + dy
                            if nx < 0 || nx >= width || ny < 0 || ny >= height { continue }
                            let nIdx = ny * width + nx
                            if !visited[nIdx] && mask[nIdx] != 0 {
                                visited[nIdx] = true
                                queue.append((nx, ny))
                            }
                        }
                    }
                }

                if pixels.count >= minArea {
                    components.append(Component(pixels: pixels))
                }
            }
        }

        return components
    }
}
