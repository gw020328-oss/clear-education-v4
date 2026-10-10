import Foundation
import PDFKit
import AppKit
let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
guard let doc = PDFDocument(url: URL(fileURLWithPath: input)) else { fatalError("PDF_READ_FAILED") }
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
print("PAGES \(doc.pageCount)")
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    print("\n=== PAGE \(i + 1) ===\n\(page.string ?? "NO_EXTRACTED_TEXT")")
    let bounds = page.bounds(for: .mediaBox)
    let image = page.thumbnail(of: NSSize(width: bounds.width * 1.5, height: bounds.height * 1.5), for: .mediaBox)
    if let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
        try png.write(to: URL(fileURLWithPath: "\(output)/page-\(i+1).png"))
    }
}
