import SwiftUI
import ZigzagiKit

struct PlayView: View {
    @State private var model: PlayModel
    @State private var showClueList = false
    @Environment(\.scenePhase) private var scenePhase

    init(puzzle: PuzzleData, store: PuzzleStore) {
        _model = State(initialValue: PlayModel(puzzle: puzzle, store: store))
    }

    var body: some View {
        VStack(spacing: 8) {
            GridView(model: model)
            ClueBarView(model: model)
            Spacer(minLength: 0)
            KeyboardView(model: model)
        }
        .padding(.horizontal, 6)
        .navigationTitle(model.puzzle.date)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            model.tick()
        }
        .onChange(of: scenePhase) {
            if scenePhase != .active { model.save() }
        }
        .onDisappear { model.save() }
        .sensoryFeedback(.success, trigger: model.showCongrats) { _, new in new }
        .alert("გილოცავ! 🎉", isPresented: $model.showCongrats) {
            Button("კარგი") {}
        } message: {
            Text("ამოხსნის დრო: \(model.elapsedText)")
        }
        .sheet(isPresented: $showClueList) {
            ClueListView(model: model)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            Text(model.elapsedText).monospacedDigit().font(.callout)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showClueList = true
            } label: {
                Image(systemName: "list.bullet")
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                scopeMenu("შემოწმება") { scope in
                    model.mutate { $0.check(scope: scope, solution: model.solution) }
                }
                scopeMenu("გამჟღავნება") { scope in
                    model.mutate { $0.reveal(scope: scope, solution: model.solution) }
                }
                scopeMenu("გასუფთავება") { scope in
                    model.mutate { $0.clear(scope) }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
        }
    }

    private func scopeMenu(_ title: String, action: @escaping (Scope) -> Void) -> some View {
        Menu(title) {
            Button("უჯრა") { action(.square) }
            Button("სიტყვა") { action(.word) }
            Button("მთლიანი") { action(.puzzle) }
        }
    }
}
