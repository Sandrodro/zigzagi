import SwiftUI
import ZigzagiKit

struct ClueBarView: View {
    let model: PlayModel

    var body: some View {
        let _ = model.revision
        HStack(spacing: 2) {
            Button {
                model.mutate { $0.prevClue() }
            } label: {
                Image(systemName: "chevron.left").padding(.horizontal, 4).padding(.vertical, 8)
            }
            Text(model.engine.currentClue()?.text ?? "—")
                .font(.callout)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture { model.mutate { $0.toggleDirection() } }
            Button {
                model.mutate { $0.nextClue() }
            } label: {
                Image(systemName: "chevron.right").padding(.horizontal, 4).padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 4)
        // Fixed height so a 1-line vs 2-line clue can't reflow and shift the grid.
        .frame(height: 56)
        .background(Color(red: 0.85, green: 0.92, blue: 1.0), in: RoundedRectangle(cornerRadius: 8))
    }
}
