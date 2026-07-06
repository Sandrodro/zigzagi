import Foundation

/// Bundles + progress as JSON files in one directory. A handful of ~5 KB
/// documents — no database. Corrupt/missing files read as nil (start fresh).
public final class PuzzleStore {
    private let dir: URL

    public init(directory: URL? = nil) {
        dir = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("Zigzagi")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func bundleURL(_ id: String) -> URL {
        dir.appendingPathComponent("bundle-\(id).json")
    }

    private func progressURL(_ id: String) -> URL {
        dir.appendingPathComponent("progress-\(id).json")
    }

    public func saveBundle(_ raw: Data, id: String) {
        try? raw.write(to: bundleURL(id), options: .atomic)
    }

    public func loadBundle(id: String) -> PuzzleData? {
        guard let data = try? Data(contentsOf: bundleURL(id)) else { return nil }
        return try? JSONDecoder().decode(PuzzleData.self, from: data)
    }

    public func saveProgress(_ progress: Progress, id: String) {
        guard let data = try? JSONEncoder().encode(progress) else { return }
        try? data.write(to: progressURL(id), options: .atomic)
    }

    public func loadProgress(id: String) -> Progress? {
        guard let data = try? Data(contentsOf: progressURL(id)) else { return nil }
        return try? JSONDecoder().decode(Progress.self, from: data)
    }

    public func cachedIds() -> Set<String> {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        return Set(
            names.filter { $0.hasPrefix("bundle-") && $0.hasSuffix(".json") }
                .map { String($0.dropFirst("bundle-".count).dropLast(".json".count)) }
        )
    }
}
