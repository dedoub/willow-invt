// Reads text and its screen rectangles from a screenshot region using macOS Vision.
// Usage: ocr-region <image> [<cropX> <cropY> <cropW> <cropH>]   (points, 1x logical)
// Emits JSON: [{ "text": ..., "x": ..., "y": ..., "w": ..., "h": ..., "confidence": ... }]
import Foundation
import Vision
import CoreGraphics
import ImageIO

let arguments = CommandLine.arguments
guard arguments.count >= 2,
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: arguments[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write("cannot read image\n".data(using: .utf8)!)
    exit(1)
}

// screencapture writes native pixels; every coordinate we emit is in logical points.
let scale = Double(image.width) / (ProcessInfo.processInfo.environment["OCR_LOGICAL_WIDTH"].flatMap(Double.init) ?? 1920.0)

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
request.usesLanguageCorrection = false

try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])

let width = Double(image.width)
let height = Double(image.height)
var results: [[String: Any]] = []

for observation in (request.results ?? []) {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    results.append([
        "text": candidate.string,
        // Vision's origin is bottom-left and normalized; ours is top-left in points.
        "x": (box.minX * width) / scale,
        "y": ((1 - box.maxY) * height) / scale,
        "w": (box.width * width) / scale,
        "h": (box.height * height) / scale,
        "confidence": candidate.confidence,
    ])
}

let data = try JSONSerialization.data(withJSONObject: results, options: [])
FileHandle.standardOutput.write(data)
