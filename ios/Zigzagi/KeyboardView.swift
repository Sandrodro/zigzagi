import SwiftUI
import ZigzagiKit

struct KeyboardView: View {
    let model: PlayModel

    // All 33 modern Georgian letters (U+10D0–U+10F0), 3 rows of 11.
    private static let rows: [[String]] = [
        ["ა", "ბ", "გ", "დ", "ე", "ვ", "ზ", "თ", "ი", "კ", "ლ"],
        ["მ", "ნ", "ო", "პ", "ჟ", "რ", "ს", "ტ", "უ", "ფ", "ქ"],
        ["ღ", "ყ", "შ", "ჩ", "ც", "ძ", "წ", "ჭ", "ხ", "ჯ", "ჰ"],
    ]

    var body: some View {
        VStack(spacing: 5) {
            ForEach(Self.rows, id: \.self) { row in
                HStack(spacing: 4) {
                    ForEach(row, id: \.self) { letter in
                        key(Text(letter).font(.system(size: 20))) {
                            model.mutate { $0.type(letter) }
                        }
                    }
                }
            }
            HStack(spacing: 4) {
                key(Image(systemName: "arrow.left.arrow.right")) {
                    model.mutate { $0.toggleDirection() }
                }
                key(Image(systemName: "delete.left")) {
                    model.mutate { $0.backspace() }
                }
            }
            .frame(maxWidth: 200)
        }
    }

    private func key(_ label: some View, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            label
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }
}
