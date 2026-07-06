import Foundation
import Observation
import ZigzagiKit

@Observable
final class AppModel {
    var puzzles: [PuzzleListItem] = []
    var cachedIds: Set<String> = []
    var offline = false

    let api = APIClient(baseURL: AppConfig.baseURL)
    let store = PuzzleStore()

    func refresh() async {
        cachedIds = store.cachedIds()
        do {
            puzzles = try await api.listPuzzles()
            offline = false
            // list is live_date-desc, so first = newest (today's, once promoted)
            if let newest = puzzles.first, !cachedIds.contains(newest.id) {
                await download(newest.id)
            }
        } catch {
            offline = true
            if puzzles.isEmpty {
                // Offline: synthesize the list from cached bundles so downloaded
                // puzzles remain playable.
                puzzles = cachedIds.compactMap { id in
                    guard let b = store.loadBundle(id: id) else { return nil }
                    return PuzzleListItem(id: b.id, date: b.date, status: "published", createdAt: "")
                }
                .sorted { $0.date > $1.date }
            }
        }
    }

    func download(_ id: String) async {
        guard let data = try? await api.fetchBundleData(id: id) else { return }
        store.saveBundle(data, id: id)
        cachedIds.insert(id)
    }
}
