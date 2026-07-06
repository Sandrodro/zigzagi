import Foundation

public enum Direction: String, Sendable {
    case across, down
}

public enum CellStatus: String, Sendable {
    case empty, filled, correct, incorrect, revealed
}

public enum Scope: Sendable {
    case square, word, puzzle
}

public struct Cell: Hashable, Sendable {
    public let row: Int
    public let col: Int
    public init(row: Int, col: Int) {
        self.row = row
        self.col = col
    }
}

private func key(_ row: Int, _ col: Int) -> String { "\(row),\(col)" }

/// Port of frontend/src/engine/crossword.ts. Keep the two in sync.
/// Deviation: check/reveal judge locally against a solution map instead of
/// applying server results (the iOS app solves offline).
public final class CrosswordEngine {
    private let puzzle: PuzzleData
    private let blocks: Set<String>
    private let absentCells: Set<String>
    private var values: [String: String] = [:]
    private var statuses: [String: CellStatus] = [:]
    public private(set) var active = Cell(row: 0, col: 0)
    public private(set) var direction: Direction = .across

    public init(puzzle: PuzzleData) {
        self.puzzle = puzzle
        self.blocks = Set(puzzle.blocks.map { key($0[0], $0[1]) })
        self.absentCells = Set((puzzle.absent ?? []).map { key($0[0], $0[1]) })
        outer: for r in 0..<puzzle.size.rows {
            for c in 0..<puzzle.size.cols where playable(r, c) {
                active = Cell(row: r, col: c)
                break outer
            }
        }
        if currentClue() == nil { direction = .down }
    }

    public var size: PuzzleSize { puzzle.size }

    public func isBlock(_ row: Int, _ col: Int) -> Bool { blocks.contains(key(row, col)) }
    public func isAbsent(_ row: Int, _ col: Int) -> Bool { absentCells.contains(key(row, col)) }

    private func inBounds(_ row: Int, _ col: Int) -> Bool {
        row >= 0 && col >= 0 && row < puzzle.size.rows && col < puzzle.size.cols
    }

    public func playable(_ row: Int, _ col: Int) -> Bool {
        inBounds(row, col) && !isBlock(row, col) && !isAbsent(row, col)
    }

    public func getValue(_ row: Int, _ col: Int) -> String {
        values[key(row, col)] ?? ""
    }

    public func getStatus(_ row: Int, _ col: Int) -> CellStatus {
        if let explicit = statuses[key(row, col)] { return explicit }
        return getValue(row, col).isEmpty ? .empty : .filled
    }

    public func setActive(_ row: Int, _ col: Int) {
        guard playable(row, col) else { return }
        active = Cell(row: row, col: col)
        // If the current direction has no clue at this cell (unchecked cell), try the other.
        if currentClue() == nil {
            direction = direction == .across ? .down : .across
        }
    }

    public func toggleDirection() {
        let other: Direction = direction == .across ? .down : .across
        // Only flip if a clue exists in the other direction at the active cell.
        if clueForCell(active.row, active.col, other) != nil { direction = other }
    }

    public func type(_ letter: String) {
        let (row, col) = (active.row, active.col)
        guard playable(row, col) else { return }
        values[key(row, col)] = letter
        statuses[key(row, col)] = nil
        // Advance to the next empty cell in the current word, jumping over filled ones.
        let stepRow = direction == .down ? 1 : 0
        let stepCol = direction == .across ? 1 : 0
        var r = row + stepRow
        var c = col + stepCol
        while playable(r, c) && !getValue(r, c).isEmpty {
            r += stepRow
            c += stepCol
        }
        if playable(r, c) {
            active = Cell(row: r, col: c)  // first empty cell ahead
        } else if playable(row + stepRow, col + stepCol) {
            active = Cell(row: row + stepRow, col: col + stepCol)  // word full ahead
        }
    }

    public func backspace() {
        let (row, col) = (active.row, active.col)
        if !getValue(row, col).isEmpty {
            values[key(row, col)] = ""
            statuses[key(row, col)] = nil
            return
        }
        let prev = direction == .across
            ? Cell(row: row, col: col - 1)
            : Cell(row: row - 1, col: col)
        if playable(prev.row, prev.col) {
            active = prev
            values[key(prev.row, prev.col)] = ""
            statuses[key(prev.row, prev.col)] = nil
        }
    }

    public enum MoveDirection: Sendable { case up, down, left, right }

    public func move(_ dir: MoveDirection) {
        let (dr, dc): (Int, Int) = switch dir {
        case .up: (-1, 0)
        case .down: (1, 0)
        case .left: (0, -1)
        case .right: (0, 1)
        }
        let next = Cell(row: active.row + dr, col: active.col + dc)
        if playable(next.row, next.col) { active = next }
    }

    public func currentWordCells() -> [Cell] {
        var cells: [Cell] = []
        let stepRow = direction == .down ? 1 : 0
        let stepCol = direction == .across ? 1 : 0
        var (row, col) = (active.row, active.col)
        while playable(row - stepRow, col - stepCol) {
            row -= stepRow
            col -= stepCol
        }
        while playable(row, col) {
            cells.append(Cell(row: row, col: col))
            row += stepRow
            col += stepCol
        }
        return cells
    }

    public func getFills() -> [String: String] {
        values.filter { !$0.value.isEmpty }
    }

    public func loadFills(_ fills: [String: String]) {
        for (k, v) in fills where !v.isEmpty { values[k] = v }
    }

    public func numberedCells() -> [NumberedCell] { puzzle.cells }

    private func allPlayableCells() -> [Cell] {
        var cells: [Cell] = []
        for r in 0..<puzzle.size.rows {
            for c in 0..<puzzle.size.cols where playable(r, c) {
                cells.append(Cell(row: r, col: c))
            }
        }
        return cells
    }

    private func wordStart(_ row: Int, _ col: Int, _ dir: Direction) -> Cell {
        var (r, c) = (row, col)
        let stepRow = dir == .down ? 1 : 0
        let stepCol = dir == .across ? 1 : 0
        while playable(r - stepRow, c - stepCol) {
            r -= stepRow
            c -= stepCol
        }
        return Cell(row: r, col: c)
    }

    public func clueForCell(_ row: Int, _ col: Int, _ dir: Direction) -> ClueRef? {
        guard playable(row, col) else { return nil }
        let start = wordStart(row, col, dir)
        let list = dir == .across ? puzzle.clues.across : puzzle.clues.down
        return list.first { $0.cell[0] == start.row && $0.cell[1] == start.col }
    }

    public func currentClue() -> ClueRef? {
        clueForCell(active.row, active.col, direction)
    }

    /// Jump straight to a clue (used by the clue list UI).
    public func selectClue(_ clue: ClueRef, _ dir: Direction) {
        direction = dir
        active = Cell(row: clue.cell[0], col: clue.cell[1])
    }

    /// True when every cell of the clue's word has a value.
    public func isClueComplete(_ clue: ClueRef, _ dir: Direction) -> Bool {
        let stepRow = dir == .down ? 1 : 0
        let stepCol = dir == .across ? 1 : 0
        var (row, col) = (clue.cell[0], clue.cell[1])
        while playable(row, col) {
            if getValue(row, col).isEmpty { return false }
            row += stepRow
            col += stepCol
        }
        return true
    }

    private func orderedClues() -> [(dir: Direction, clue: ClueRef)] {
        puzzle.clues.across.map { (Direction.across, $0) }
            + puzzle.clues.down.map { (Direction.down, $0) }
    }

    private func gotoClue(offset: Int) {
        let ordered = orderedClues()
        guard !ordered.isEmpty else { return }
        let cur = currentClue()
        var idx = ordered.firstIndex {
            $0.dir == direction && cur != nil && $0.clue.number == cur!.number
        } ?? -1
        if idx == -1 { idx = 0 }
        let n = ordered.count
        let target = ordered[((idx + offset) % n + n) % n]
        direction = target.dir
        active = Cell(row: target.clue.cell[0], col: target.clue.cell[1])
    }

    public func nextClue() { gotoClue(offset: 1) }
    public func prevClue() { gotoClue(offset: -1) }

    public func isComplete() -> Bool {
        allPlayableCells().allSatisfy { !getValue($0.row, $0.col).isEmpty }
    }

    public func cellsForScope(_ scope: Scope) -> [Cell] {
        switch scope {
        case .square: [active]
        case .word: currentWordCells()
        case .puzzle: allPlayableCells()
        }
    }

    public func clear(_ scope: Scope) {
        for c in cellsForScope(scope) {
            values[key(c.row, c.col)] = ""
            statuses[key(c.row, c.col)] = nil
        }
    }

    // MARK: - Local judge (offline replacement for server check/reveal)

    public func check(scope: Scope, solution: [String: String]) {
        for c in cellsForScope(scope) {
            let v = getValue(c.row, c.col)
            guard !v.isEmpty else { continue }  // don't judge empty cells
            statuses[key(c.row, c.col)] = solution[key(c.row, c.col)] == v ? .correct : .incorrect
        }
    }

    public func reveal(scope: Scope, solution: [String: String]) {
        for c in cellsForScope(scope) {
            guard let v = solution[key(c.row, c.col)] else { continue }
            values[key(c.row, c.col)] = v
            statuses[key(c.row, c.col)] = .revealed
        }
    }

    public func isSolved(solution: [String: String]) -> Bool {
        allPlayableCells().allSatisfy { getValue($0.row, $0.col) == solution[key($0.row, $0.col)] }
    }
}
