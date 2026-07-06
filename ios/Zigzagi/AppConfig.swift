import Foundation

enum AppConfig {
    #if DEBUG
    static let baseURL = URL(string: "http://localhost:8000")!
    #else
    static let baseURL = URL(string: "https://REPLACE-WITH-PROD-HOST")!  // set before TestFlight (Task 7)
    #endif
}
