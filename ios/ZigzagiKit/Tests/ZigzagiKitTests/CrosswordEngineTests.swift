import XCTest
@testable import ZigzagiKit

// Fixtures mirror frontend/src/engine/__test__/crossword.test.ts exactly.
private let PUZZLE = PuzzleData(
    id: "p1", date: "2026-06-18",
    size: PuzzleSize(rows: 5, cols: 5), blocks: [], absent: nil,
    cells: [
        NumberedCell(row: 0, col: 0, number: 1),
        NumberedCell(row: 0, col: 1, number: 2),
        NumberedCell(row: 1, col: 0, number: 6),
    ],
    clues: Clues(
        across: [ClueRef(number: 1, cell: [0, 0], length: 5, text: "1A")],
        down: [ClueRef(number: 1, cell: [0, 0], length: 5, text: "1D")]
    ),
    solution: nil
)

private let CLUE_PUZZLE = PuzzleData(
    id: "p2", date: "2026-06-18",
    size: PuzzleSize(rows: 3, cols: 3), blocks: [[1, 2]], absent: nil,
    cells: [
        NumberedCell(row: 0, col: 0, number: 1),
        NumberedCell(row: 0, col: 1, number: 2),
        NumberedCell(row: 0, col: 2, number: 3),
        NumberedCell(row: 1, col: 0, number: 4),
        NumberedCell(row: 2, col: 0, number: 5),
    ],
    clues: Clues(
        across: [
            ClueRef(number: 1, cell: [0, 0], length: 3, text: "1A"),
            ClueRef(number: 4, cell: [1, 0], length: 2, text: "4A"),
            ClueRef(number: 5, cell: [2, 0], length: 2, text: "5A"),
        ],
        down: [
            ClueRef(number: 1, cell: [0, 0], length: 3, text: "1D"),
            ClueRef(number: 2, cell: [0, 1], length: 3, text: "2D"),
            ClueRef(number: 3, cell: [0, 2], length: 1, text: "3D"),
        ]
    ),
    solution: nil
)

// (1,0) and (2,0) are only part of a DOWN word — no across run.
private let UNCHECKED_PUZZLE = PuzzleData(
    id: "p3", date: "2026-06-18",
    size: PuzzleSize(rows: 3, cols: 2), blocks: [[1, 1], [2, 1]], absent: nil,
    cells: [
        NumberedCell(row: 0, col: 0, number: 1),
        NumberedCell(row: 0, col: 1, number: 2),
    ],
    clues: Clues(
        across: [ClueRef(number: 1, cell: [0, 0], length: 2, text: "1A")],
        down: [ClueRef(number: 1, cell: [0, 0], length: 3, text: "1D")]
    ),
    solution: nil
)

final class CrosswordEngineTests: XCTestCase {
    func testStartsAtOriginGoingAcross() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        XCTAssertEqual(e.active, Cell(row: 0, col: 0))
        XCTAssertEqual(e.direction, .across)
    }

    func testTogglesDirection() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.toggleDirection()
        XCTAssertEqual(e.direction, .down)
    }

    func testTypingWritesLetterAndAdvances() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.type("ა")
        XCTAssertEqual(e.getValue(0, 0), "ა")
        XCTAssertEqual(e.active, Cell(row: 0, col: 1))
    }

    func testTypingJumpsOverFilledCell() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.setActive(0, 1)
        e.type("ბ")
        e.setActive(0, 0)
        e.type("ა")  // (0,1) occupied -> skip to (0,2)
        XCTAssertEqual(e.getValue(0, 0), "ა")
        XCTAssertEqual(e.active, Cell(row: 0, col: 2))
    }

    func testDoesNotAdvancePastLastCell() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.setActive(0, 4)
        e.type("ე")
        XCTAssertEqual(e.active, Cell(row: 0, col: 4))
    }

    func testBackspaceClearsAndStepsBack() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.type("ა")      // now at (0,1)
        e.backspace()    // (0,1) empty -> step back to (0,0) and clear it
        XCTAssertEqual(e.active, Cell(row: 0, col: 0))
    }

    func testCurrentWordCellsReturnsWholeRow() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        let cells = e.currentWordCells()
        XCTAssertEqual(cells.count, 5)
        XCTAssertEqual(cells.first, Cell(row: 0, col: 0))
        XCTAssertEqual(cells.last, Cell(row: 0, col: 4))
    }

    func testGetFillsReturnsKeyedLetters() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.type("ა")
        XCTAssertEqual(e.getFills(), ["0,0": "ა"])
    }

    func testMoveDownChangesActiveRow() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.move(.down)
        XCTAssertEqual(e.active, Cell(row: 1, col: 0))
    }
}

final class CheckRevealTests: XCTestCase {
    func testCheckMarksCorrectAndIncorrectAndSkipsEmpty() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.type("ა")  // (0,0) filled, active -> (0,1)
        e.setActive(0, 1)
        e.type("ბ")
        let solution = ["0,0": "ა", "0,1": "გ", "0,2": "დ"]
        e.check(scope: .word, solution: solution)
        XCTAssertEqual(e.getStatus(0, 0), .correct)
        XCTAssertEqual(e.getStatus(0, 1), .incorrect)
        XCTAssertEqual(e.getStatus(0, 2), .empty)  // empty cells not judged
    }

    func testRevealWritesValueAndMarksRevealed() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.reveal(scope: .square, solution: ["0,0": "ა"])
        XCTAssertEqual(e.getValue(0, 0), "ა")
        XCTAssertEqual(e.getStatus(0, 0), .revealed)
    }

    func testTypingOverCheckedCellClearsStatus() {
        let e = CrosswordEngine(puzzle: PUZZLE)
        e.type("ბ")
        e.setActive(0, 0)
        e.check(scope: .square, solution: ["0,0": "ა"])
        XCTAssertEqual(e.getStatus(0, 0), .incorrect)
        e.type("გ")
        XCTAssertEqual(e.getStatus(0, 0), .filled)
    }

    func testIsSolved() {
        let e = CrosswordEngine(puzzle: UNCHECKED_PUZZLE)
        let solution = ["0,0": "ა", "0,1": "ბ", "1,0": "გ", "2,0": "დ"]
        XCTAssertFalse(e.isSolved(solution: solution))
        e.loadFills(solution)
        XCTAssertTrue(e.isSolved(solution: solution))
        e.setActive(0, 1)
        e.type("ე")  // wrong letter
        XCTAssertFalse(e.isSolved(solution: solution))
    }
}

final class UncheckedCellTests: XCTestCase {
    func testSetActiveAutoSwitchesDirection() {
        let e = CrosswordEngine(puzzle: UNCHECKED_PUZZLE)
        XCTAssertEqual(e.direction, .across)
        e.setActive(1, 0)  // no across clue here
        XCTAssertNotNil(e.currentClue())
        XCTAssertEqual(e.direction, .down)
    }

    func testToggleDoesNotFlipWhenOtherDirectionHasNoClue() {
        let e = CrosswordEngine(puzzle: UNCHECKED_PUZZLE)
        e.setActive(1, 0)     // auto-switches to down
        e.toggleDirection()   // no across clue -> stays down
        XCTAssertEqual(e.direction, .down)
        XCTAssertNotNil(e.currentClue())
    }
}

final class ClueModelTests: XCTestCase {
    func testCurrentClueTracksActiveCellAndDirection() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.setActive(0, 1)
        XCTAssertEqual(e.currentClue()?.number, 1)  // across by default
        e.toggleDirection()
        XCTAssertEqual(e.currentClue()?.number, 2)  // now down
    }

    func testClueForCellFindsOwningClue() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        XCTAssertEqual(e.clueForCell(2, 1, .across)?.number, 5)
        XCTAssertEqual(e.clueForCell(1, 0, .down)?.number, 1)
    }

    func testNextPrevClueWalkCombinedOrder() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.setActive(0, 0)
        e.nextClue()
        XCTAssertEqual(e.currentClue()?.number, 4)
        e.prevClue()
        XCTAssertEqual(e.currentClue()?.number, 1)
    }

    func testNextClueSwitchesDirectionAtBoundary() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.setActive(2, 0)  // 5-Across, last across clue
        e.nextClue()
        XCTAssertEqual(e.direction, .down)
        XCTAssertEqual(e.currentClue()?.number, 1)
    }

    func testSelectClueJumpsToClueStart() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        let clue = CLUE_PUZZLE.clues.down[1]  // 2D at (0,1)
        e.selectClue(clue, .down)
        XCTAssertEqual(e.active, Cell(row: 0, col: 1))
        XCTAssertEqual(e.direction, .down)
        XCTAssertEqual(e.currentClue()?.number, 2)
    }

    func testIsCompleteOnlyWhenEveryPlayableCellFilled() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        XCTAssertFalse(e.isComplete())
        let playable = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (2, 0), (2, 1), (2, 2)]
        for (r, c) in playable {
            e.setActive(r, c)
            e.type("ა")
        }
        XCTAssertTrue(e.isComplete())
    }

    func testCellsForScope() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.setActive(0, 1)
        XCTAssertEqual(e.cellsForScope(.square), [Cell(row: 0, col: 1)])
        XCTAssertEqual(e.cellsForScope(.word), [
            Cell(row: 0, col: 0), Cell(row: 0, col: 1), Cell(row: 0, col: 2),
        ])
        XCTAssertEqual(e.cellsForScope(.puzzle).count, 8)
    }

    func testClearScopeOnly() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.loadFills(["0,0": "ა", "0,1": "ბ", "0,2": "გ", "1,0": "დ"])
        e.setActive(0, 0)
        e.check(scope: .square, solution: ["0,0": "x"])  // marks (0,0) incorrect
        e.setActive(0, 1)  // across word = row 0, cols 0..2
        e.clear(.word)
        XCTAssertEqual(e.getValue(0, 0), "")
        XCTAssertEqual(e.getValue(0, 2), "")
        XCTAssertEqual(e.getStatus(0, 0), .empty)  // status cleared too
        XCTAssertEqual(e.getValue(1, 0), "დ")      // outside the word, untouched
    }

    func testLoadFillsOverwritesFromPersistedDict() {
        let e = CrosswordEngine(puzzle: CLUE_PUZZLE)
        e.loadFills(["0,0": "ა", "1,1": "ბ"])
        XCTAssertEqual(e.getValue(0, 0), "ა")
        XCTAssertEqual(e.getValue(1, 1), "ბ")
    }
}
