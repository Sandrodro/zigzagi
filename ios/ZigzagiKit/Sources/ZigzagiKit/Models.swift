import Foundation

public struct PuzzleSize: Codable, Equatable, Sendable {
    public let rows: Int
    public let cols: Int
}

public struct NumberedCell: Codable, Equatable, Sendable {
    public let row: Int
    public let col: Int
    public let number: Int
}

public struct ClueRef: Codable, Equatable, Sendable {
    public let number: Int
    public let cell: [Int]  // [row, col], as the API sends it
    public let length: Int
    public let text: String?  // clue may be null before AI clue generation
}

public struct Clues: Codable, Equatable, Sendable {
    public let across: [ClueRef]
    public let down: [ClueRef]
}

public struct SolutionCell: Codable, Equatable, Sendable {
    public let row: Int
    public let col: Int
    public let value: String
}

/// The play DTO. `solution` is present only in /bundle payloads.
public struct PuzzleData: Codable, Sendable {
    public let id: String
    public let date: String
    public let size: PuzzleSize
    public let blocks: [[Int]]
    public let absent: [[Int]]?
    public let cells: [NumberedCell]
    public let clues: Clues
    public let solution: [SolutionCell]?

    /// Solution keyed "row,col" — the shape the engine's check/reveal take.
    public var solutionMap: [String: String] {
        Dictionary(uniqueKeysWithValues: (solution ?? []).map { ("\($0.row),\($0.col)", $0.value) })
    }
}

public struct PuzzleListItem: Codable, Identifiable, Sendable {
    public let id: String
    public let date: String
    public let status: String
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, date, status
        case createdAt = "created_at"
    }

    // Public so the app target can synthesize list items from cache when offline.
    public init(id: String, date: String, status: String, createdAt: String) {
        self.id = id
        self.date = date
        self.status = status
        self.createdAt = createdAt
    }
}

/// Device-local solve state, one JSON file per puzzle (Task 4's PuzzleStore).
public struct Progress: Codable, Sendable {
    public var fills: [String: String] = [:]  // "row,col" -> letter
    public var elapsedSeconds: Int = 0
    public var completed: Bool = false
    public init() {}
}
