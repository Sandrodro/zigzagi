import SwiftUI
import ZigzagiKit

struct ClueListView: View {
    let model: PlayModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let _ = model.revision
        NavigationStack {
            List {
                section("გარდიგარდმო", clues: model.puzzle.clues.across, dir: .across)
                section("ვერტიკალურად", clues: model.puzzle.clues.down, dir: .down)
            }
            .navigationTitle("განმარტებები")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func section(_ title: String, clues: [ClueRef], dir: Direction) -> some View {
        Section(title) {
            ForEach(clues, id: \.number) { clue in
                Button {
                    model.mutate { $0.selectClue(clue, dir) }
                    dismiss()
                } label: {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(clue.number)").bold().frame(width: 28, alignment: .trailing)
                        Text(clue.text ?? "—")
                            .foregroundStyle(
                                model.engine.isClueComplete(clue, dir) ? .secondary : .primary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
