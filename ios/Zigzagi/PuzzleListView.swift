import SwiftUI
import ZigzagiKit

struct PuzzleListView: View {
    let model: AppModel

    var body: some View {
        NavigationStack {
            List(model.puzzles) { item in
                if model.cachedIds.contains(item.id) {
                    NavigationLink(value: item.id) {
                        row(item, cached: true)
                    }
                } else {
                    Button {
                        Task { await model.download(item.id) }
                    } label: {
                        row(item, cached: false)
                    }
                }
            }
            .navigationTitle("ზიგზაგი")
            .navigationDestination(for: String.self) { id in
                if let puzzle = model.store.loadBundle(id: id) {
                    PlayView(puzzle: puzzle, store: model.store)
                }
            }
            .refreshable { await model.refresh() }
            .overlay {
                if model.puzzles.isEmpty {
                    ContentUnavailableView(
                        model.offline ? "ინტერნეტი არ არის" : "კროსვორდები არ არის",
                        systemImage: model.offline ? "wifi.slash" : "square.grid.3x3"
                    )
                }
            }
            .safeAreaInset(edge: .top) {
                if model.offline && !model.puzzles.isEmpty {
                    Text("ოფლაინ რეჟიმი — ჩამოტვირთული კროსვორდები ხელმისაწვდომია")
                        .font(.caption)
                        .frame(maxWidth: .infinity)
                        .padding(6)
                        .background(.yellow.opacity(0.3))
                }
            }
        }
    }

    private func row(_ item: PuzzleListItem, cached: Bool) -> some View {
        HStack {
            Text(item.date).foregroundStyle(.primary)
            Spacer()
            if model.store.loadProgress(id: item.id)?.completed == true {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            } else if !cached {
                Image(systemName: "arrow.down.circle").foregroundStyle(.secondary)
            }
        }
    }
}
