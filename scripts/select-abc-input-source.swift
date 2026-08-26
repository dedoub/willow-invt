import Foundation
import Carbon.HIToolbox

let sources = TISCreateInputSourceList(nil, false).takeRetainedValue() as NSArray
var selected = false

for case let source as TISInputSource in sources {
    guard let pointer = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else {
        continue
    }
    let identifier = Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
    if identifier == "com.apple.keylayout.ABC" {
        selected = TISSelectInputSource(source) == noErr
        break
    }
}

if !selected {
    fputs("ABC input source not found\n", stderr)
    exit(1)
}
