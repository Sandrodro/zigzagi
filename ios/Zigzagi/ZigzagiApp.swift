import SwiftUI

@main
struct ZigzagiApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            PuzzleListView(model: model)
                .task { await model.refresh() }
        }
    }
}
