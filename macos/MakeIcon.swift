import AppKit
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let p = CGFloat(pixels)
        NSColor(calibratedRed: 0.07, green: 0.16, blue: 0.14, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: p*0.04, y: p*0.04, width: p*0.92, height: p*0.92), xRadius: p*0.21, yRadius: p*0.21).fill()
        NSColor(calibratedRed: 0.65, green: 0.96, blue: 0.55, alpha: 1).setStroke()
        for y in [0.31, 0.5, 0.69] {
            let path = NSBezierPath()
            path.lineWidth = p*0.055
            path.lineCapStyle = .round
            path.lineJoinStyle = .round
            path.move(to: NSPoint(x:p*0.27,y:p*y))
            path.line(to: NSPoint(x:p*0.73,y:p*y))
            path.move(to: NSPoint(x:p*0.63,y:p*(y+0.075)))
            path.line(to: NSPoint(x:p*0.73,y:p*y))
            path.line(to: NSPoint(x:p*0.63,y:p*(y-0.075)))
            path.stroke()
        }
        NSGraphicsContext.restoreGraphicsState()
        let filename = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent(filename))
    }
}
