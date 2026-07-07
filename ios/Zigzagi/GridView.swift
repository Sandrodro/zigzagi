import SwiftUI
import ZigzagiKit

struct GridView: View {
    let model: PlayModel

    var body: some View {
        let engine = model.engine
        let _ = model.revision  // observe: re-render on engine mutations
        let word = Set(engine.currentWordCells())
        let cols = engine.size.cols
        let rows = engine.size.rows
        // Measure once and size cells explicitly — a per-cell GeometryReader has
        // no intrinsic size, which let the grid frame drift off-square.
        GeometryReader { geo in
            let spacing: CGFloat = 1
            let cell = ((geo.size.width - spacing * CGFloat(cols - 1)) / CGFloat(cols))
                .rounded(.down)
            let side = cell * CGFloat(cols) + spacing * CGFloat(cols - 1)
            VStack(spacing: spacing) {
                ForEach(0..<rows, id: \.self) { r in
                    HStack(spacing: spacing) {
                        ForEach(0..<cols, id: \.self) { c in
                            CellView(
                                size: cell,
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
            .frame(width: side, height: side)
            .padding(spacing)
            .background(Color.black)
            .frame(maxWidth: .infinity)  // center the square horizontally
        }
        .aspectRatio(CGFloat(cols) / CGFloat(rows), contentMode: .fit)
        .id(model.revision)
    }
}

private struct CellView: View {
    let size: CGFloat
    let value: String
    let status: CellStatus
    let number: Int?
    let isBlock: Bool
    let isAbsent: Bool
    let isActive: Bool
    let inWord: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(background)
            if !isBlock && !isAbsent {
                if let number {
                    Text("\(number)")
                        .font(.system(size: max(size * 0.22, 6)))
                        .padding(1)
                }
                Text(value)
                    .font(.system(size: size * 0.55, weight: .medium))
                    .foregroundStyle(letterColor)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: size, height: size)
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
