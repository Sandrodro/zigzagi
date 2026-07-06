import Foundation
import Observation
import ZigzagiKit

@Observable
final class PlayModel {
    let puzzle: PuzzleData
    let engine: CrosswordEngine
    let solution: [String: String]
    let numbers: [Cell: Int]
    private let store: PuzzleStore

    private(set) var revision = 0  // bumped on every engine mutation; views read it to re-render
    var elapsed: Int
    var completed: Bool
    var showCongrats = false

    init(puzzle: PuzzleData, store: PuzzleStore) {
        self.puzzle = puzzle
        self.store = store
        engine = CrosswordEngine(puzzle: puzzle)
        solution = puzzle.solutionMap
        numbers = Dictionary(
            uniqueKeysWithValues: puzzle.cells.map { (Cell(row: $0.row, col: $0.col), $0.number) })
        let progress = store.loadProgress(id: puzzle.id) ?? Progress()
        engine.loadFills(progress.fills)
        elapsed = progress.elapsedSeconds
        completed = progress.completed
    }

    var elapsedText: String {
        String(format: "%d:%02d", elapsed / 60, elapsed % 60)
    }

    func mutate(_ change: (CrosswordEngine) -> Void) {
        change(engine)
        revision += 1
        if !completed && engine.isSolved(solution: solution) {
            completed = true
            showCongrats = true
        }
        save()
    }

    func tap(_ row: Int, _ col: Int) {
        mutate { e in
            if e.active == Cell(row: row, col: col) {
                e.toggleDirection()
            } else {
                e.setActive(row, col)
            }
        }
    }

    func tick() {
        guard !completed else { return }
        elapsed += 1
        // ponytail: coarse timer autosave; fills are saved on every mutation anyway
        if elapsed % 10 == 0 { save() }
    }

    func save() {
        var p = Progress()
        p.fills = engine.getFills()
        p.elapsedSeconds = elapsed
        p.completed = completed
        store.saveProgress(p, id: puzzle.id)
    }
}
