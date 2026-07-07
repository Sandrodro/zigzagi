import SwiftUI
import ZigzagiKit

struct GridView: View {
    let model: PlayModel

    var body: some View {
        let engine = model.engine
        let _ = model.revision  // observe: re-render on engine mutations
        let word = Set(engine.currentWordCells())
        VStack(spacing: 1) {
            ForEach(0..<engine.size.rows, id: \.self) { r in
                HStack(spacing: 1) {
                    ForEach(0..<engine.size.cols, id: \.self) { c in
                        CellView(
                            value: engine.getValue(r, c),
                            status: engine.getStatus(r, c),
                            number: model.numbers[Cell(row: r, col: c)],
                            isBlock: engine.isBlock(r, c),
                            isAbsent: engine.isAbsent(r, c),
                            isActive: engine.active == Cell(row: r, col: c),
                            inWord: word.contains(Cell(row: r, col: c))
                        )
                        .onTapGesture { model.tap(r, c) }
                    }
                }
            }
        }
        .padding(1)
        .background(Color.black)
        .aspectRatio(CGFloat(engine.size.cols) / CGFloat(engine.size.rows), contentMode: .fit)
        // ForEach(0..<n) caches its children; .id forces the cell tree to rebuild
        // when the engine mutates in place. ponytail: 121 cells, rebuild is cheap.
        .id(model.revision)
    }
}

private struct CellView: View {
    let value: String
    let status: CellStatus
    let number: Int?
    let isBlock: Bool
    let isAbsent: Bool
    let isActive: Bool
    let inWord: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                Rectangle().fill(background)
                if !isBlock && !isAbsent {
                    if let number {
                        Text("\(number)")
                            .font(.system(size: max(geo.size.height * 0.22, 6)))
                            .padding(1)
                    }
                    Text(value)
                        .font(.system(size: geo.size.height * 0.55, weight: .medium))
                        .foregroundStyle(letterColor)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private var background: Color {
        if isAbsent { return Color(.systemBackground) }
        if isBlock { return .black }
        if isActive { return Color(red: 1.0, green: 0.85, blue: 0.4) }
        if inWord { return Color(red: 0.80, green: 0.90, blue: 1.0) }
        return .white
    }

    private var letterColor: Color {
        switch status {
        case .incorrect: .red
        case .revealed: .blue
        case .correct: Color(red: 0, green: 0.5, blue: 0.2)
        default: .black
        }
    }
}
