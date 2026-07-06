import XCTest
@testable import ZigzagiKit

final class PuzzleStoreTests: XCTestCase {
    var dir: URL!
    var store: PuzzleStore!

    override func setUp() {
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        store = PuzzleStore(directory: dir)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
    }

    let bundleJSON = """
    {"id": "p1", "date": "2026-07-06", "size": {"rows": 1, "cols": 1},
     "blocks": [], "absent": [], "cells": [{"row": 0, "col": 0, "number": 1}],
     "clues": {"across": [], "down": []},
     "solution": [{"row": 0, "col": 0, "value": "ა"}]}
    """.data(using: .utf8)!

    func testBundleRoundTrip() {
        store.saveBundle(bundleJSON, id: "p1")
        let loaded = store.loadBundle(id: "p1")
        XCTAssertEqual(loaded?.id, "p1")
        XCTAssertEqual(loaded?.solutionMap["0,0"], "ა")
        XCTAssertEqual(store.cachedIds(), ["p1"])
    }

    func testMissingBundleReturnsNil() {
        XCTAssertNil(store.loadBundle(id: "nope"))
        XCTAssertEqual(store.cachedIds(), [])
    }

    func testCorruptBundleReturnsNil() {
        store.saveBundle("not json".data(using: .utf8)!, id: "bad")
        XCTAssertNil(store.loadBundle(id: "bad"))
    }

    func testProgressRoundTrip() {
        var p = Progress()
        p.fills = ["0,0": "ა"]
        p.elapsedSeconds = 42
        p.completed = true
        store.saveProgress(p, id: "p1")
        let loaded = store.loadProgress(id: "p1")
        XCTAssertEqual(loaded?.fills, ["0,0": "ა"])
        XCTAssertEqual(loaded?.elapsedSeconds, 42)
        XCTAssertEqual(loaded?.completed, true)
    }

    func testCorruptProgressReturnsNil() {
        try? "garbage".data(using: .utf8)!.write(
            to: dir.appendingPathComponent("progress-p9.json"))
        XCTAssertNil(store.loadProgress(id: "p9"))
    }
}
