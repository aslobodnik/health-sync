import Foundation

actor OutboxStore {
    private let directory: URL

    init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        directory = docs.appendingPathComponent("OutboxStore/pages", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func savePage(_ page: StagedPage) throws {
        let data = try JSONEncoder().encode(page)
        let url = directory.appendingPathComponent("\(page.id.uuidString).json")
        try data.write(to: url, options: .atomic)
    }

    func loadPendingPages() -> [StagedPage] {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey]) else {
            return []
        }
        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { url -> StagedPage? in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? JSONDecoder().decode(StagedPage.self, from: data)
            }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func updateBatchStatus(pageId: UUID, batchId: UUID, status: BatchStatus) throws {
        let url = directory.appendingPathComponent("\(pageId.uuidString).json")
        guard let data = try? Data(contentsOf: url),
              var page = try? JSONDecoder().decode(StagedPage.self, from: data) else {
            return
        }
        if let index = page.batches.firstIndex(where: { $0.id == batchId }) {
            page.batches[index].status = status
        }
        let updated = try JSONEncoder().encode(page)
        try updated.write(to: url, options: .atomic)
    }

    func removePage(_ pageId: UUID) {
        let url = directory.appendingPathComponent("\(pageId.uuidString).json")
        try? FileManager.default.removeItem(at: url)
    }

    func pageCount() -> Int {
        let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        return files?.filter { $0.pathExtension == "json" }.count ?? 0
    }
}
