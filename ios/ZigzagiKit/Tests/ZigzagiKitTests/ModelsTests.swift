import XCTest
@testable import ZigzagiKit

final class ModelsTests: XCTestCase {
    // Shape produced by GET /api/play/puzzles/by-id/{id}/bundle (Task 1).
    let bundleJSON = """
    {
      "id": "abc", "date": "2026-07-06",
      "size": {"rows": 2, "cols": 2},
      "blocks": [[1, 1]], "absent": [],
      "cells": [{"row": 0, "col": 0, "number": 1}, {"row": 0, "col": 1, "number": 2}],
      "clues": {
        "across": [{"number": 1, "cell": [0, 0], "length": 2, "text": "clue"}],
        "down": [{"number": 1, "cell": [0, 0], "length": 2, "text": null}]
      },
      "solution": [
        {"row": 0, "col": 0, "value": "ა"}, {"row": 0, "col": 1, "value": "ბ"},
        {"row": 1, "col": 0, "value": "გ"}
      ]
    }
    """.data(using: .utf8)!

    func testDecodesBundle() throws {
        let p = try JSONDecoder().decode(PuzzleData.self, from: bundleJSON)
        XCTAssertEqual(p.size.rows, 2)
        XCTAssertEqual(p.blocks, [[1, 1]])
        XCTAssertEqual(p.cells.first?.number, 1)
        XCTAssertEqual(p.clues.across.first?.text, "clue")
        XCTAssertNil(p.clues.down.first?.text)  // clue may be null pre-review
        XCTAssertEqual(p.solutionMap["0,0"], "ა")
        XCTAssertEqual(p.solutionMap.count, 3)
    }

    func testDecodesPlainDTOWithoutSolution() throws {
        // /puzzles/{date} responses have no "solution" key
        var obj = try JSONSerialization.jsonObject(with: bundleJSON) as! [String: Any]
        obj.removeValue(forKey: "solution")
        let data = try JSONSerialization.data(withJSONObject: obj)
        let p = try JSONDecoder().decode(PuzzleData.self, from: data)
        XCTAssertTrue(p.solutionMap.isEmpty)
    }

    func testDecodesListItem() throws {
        let json = """
        [{"id": "x", "date": "2026-07-06", "status": "published", "created_at": "2026-07-01T10:00:00"}]
        """.data(using: .utf8)!
        let items = try JSONDecoder().decode([PuzzleListItem].self, from: json)
        XCTAssertEqual(items.first?.createdAt, "2026-07-01T10:00:00")
    }
}
