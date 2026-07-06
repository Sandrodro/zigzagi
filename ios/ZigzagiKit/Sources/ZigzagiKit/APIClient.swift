import Foundation

public struct APIClient: Sendable {
    public let baseURL: URL

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    public func listPuzzles() async throws -> [PuzzleListItem] {
        let data = try await get("api/play/puzzles")
        return try JSONDecoder().decode([PuzzleListItem].self, from: data)
    }

    /// Raw bytes so the caller can persist exactly what the server sent.
    public func fetchBundleData(id: String) async throws -> Data {
        try await get("api/play/puzzles/by-id/\(id)/bundle")
    }

    private func get(_ path: String) async throws -> Data {
        let url = baseURL.appendingPathComponent(path)
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}
