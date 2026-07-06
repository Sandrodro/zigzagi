import SwiftUI
import ZigzagiKit

struct ClueBarView: View {
    let model: PlayModel

    var body: some View {
        let _ = model.revision
        HStack {
            Button {
                model.mutate { $0.prevClue() }
            } label: {
                Image(systemName: "chevron.left").padding(8)
            }
            VStack(spacing: 2) {
                if let clue = model.engine.currentClue() {
                    Text("\(clue.number)\(model.engine.direction == .across ? "→" : "↓")")
                        .font(.caption.bold())
                    Text(clue.text ?? "—")
                        .font(.callout)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .onTapGesture { model.mutate { $0.toggleDirection() } }
            Button {
                model.mutate { $0.nextClue() }
            } label: {
                Image(systemName: "chevron.right").padding(8)
            }
        }
        .padding(.vertical, 6)
        .background(Color(red: 0.85, green: 0.92, blue: 1.0), in: RoundedRectangle(cornerRadius: 8))
    }
}
