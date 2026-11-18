// 澄学 EJU 3.0 app icon: a frosted (translucent) glass sheet behind an opaque glass worksheet with a check —
// the app's two materials, and a study mark. Full-bleed square; macOS applies its own mask.
// Usage: swift make_icon.swift <out.png> [size]
import AppKit
import CoreGraphics

let args = CommandLine.arguments
let out = args.count > 1 ? args[1] : "icon_1024.png"
let S = CGFloat(args.count > 2 ? Double(args[2]) ?? 1024 : 1024)
let k = S / 1024
let cs = CGColorSpace(name: CGColorSpace.displayP3)!
let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.translateBy(x: 0, y: S); ctx.scaleBy(x: 1, y: -1) // top-left origin
func c(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor { CGColor(colorSpace: cs, components: [r / 255, g / 255, b / 255, a])! }
func grad(_ stops: [(CGFloat, CGColor)]) -> CGGradient { CGGradient(colorsSpace: cs, colors: stops.map { $0.1 } as CFArray, locations: stops.map { $0.0 })! }
func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath { CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil) }
let full = CGRect(x: 0, y: 0, width: S, height: S)

// background: deep blue with a soft light from the top-left
ctx.setFillColor(c(22, 36, 86)); ctx.fill(full)
ctx.drawLinearGradient(grad([(0, c(70, 116, 226)), (0.55, c(34, 58, 140)), (1, c(16, 26, 70))]), start: .zero, end: CGPoint(x: S, y: S), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
ctx.drawRadialGradient(grad([(0, c(150, 200, 255, 0.45)), (1, c(150, 200, 255, 0))]), startCenter: CGPoint(x: 260 * k, y: 200 * k), startRadius: 0, endCenter: CGPoint(x: 260 * k, y: 200 * k), endRadius: 620 * k, options: [])

// back sheet: frosted translucent glass, rotated
ctx.saveGState()
ctx.translateBy(x: 560 * k, y: 470 * k); ctx.rotate(by: 0.17)
let back = CGRect(x: -230 * k, y: -290 * k, width: 460 * k, height: 580 * k)
ctx.setShadow(offset: CGSize(width: 0, height: 20 * k), blur: 60 * k, color: c(0, 8, 40, 0.12))
ctx.addPath(rounded(back, 64 * k)); ctx.setFillColor(c(255, 255, 255, 0.22)); ctx.fillPath()
ctx.setShadow(offset: .zero, blur: 0, color: nil)
ctx.addPath(rounded(back, 64 * k)); ctx.clip()
ctx.drawLinearGradient(grad([(0, c(255, 255, 255, 0.32)), (0.5, c(255, 255, 255, 0.08)), (1, c(255, 255, 255, 0.16))]), start: CGPoint(x: back.minX, y: back.minY), end: CGPoint(x: back.maxX, y: back.maxY), options: [])
ctx.resetClip()
ctx.addPath(rounded(back.insetBy(dx: 1.5 * k, dy: 1.5 * k), 63 * k)); ctx.setStrokeColor(c(255, 255, 255, 0.55)); ctx.setLineWidth(3 * k); ctx.strokePath()
ctx.restoreGState()

// front sheet: opaque glass worksheet
let front = CGRect(x: 250 * k, y: 290 * k, width: 460 * k, height: 580 * k)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 30 * k), blur: 70 * k, color: c(0, 6, 36, 0.5))
ctx.addPath(rounded(front, 64 * k)); ctx.setFillColor(c(246, 249, 255)); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(rounded(front, 64 * k)); ctx.clip()
ctx.drawLinearGradient(grad([(0, c(255, 255, 255)), (1, c(226, 234, 250))]), start: CGPoint(x: front.minX, y: front.minY), end: CGPoint(x: front.minX, y: front.maxY), options: [])
ctx.restoreGState()
ctx.addPath(rounded(front.insetBy(dx: 1.5 * k, dy: 1.5 * k), 63 * k)); ctx.setStrokeColor(c(255, 255, 255, 0.9)); ctx.setLineWidth(3 * k); ctx.strokePath()

// ruled lines
ctx.setLineCap(.round)
ctx.setStrokeColor(c(178, 196, 230)); ctx.setLineWidth(26 * k)
ctx.move(to: CGPoint(x: 330 * k, y: 420 * k)); ctx.addLine(to: CGPoint(x: 630 * k, y: 420 * k)); ctx.strokePath()
ctx.move(to: CGPoint(x: 330 * k, y: 510 * k)); ctx.addLine(to: CGPoint(x: 540 * k, y: 510 * k)); ctx.strokePath()

// check mark
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 8 * k), blur: 20 * k, color: c(40, 100, 240, 0.45))
ctx.setLineJoin(.round); ctx.setLineCap(.round)
ctx.setStrokeColor(c(44, 104, 236)); ctx.setLineWidth(52 * k)
ctx.move(to: CGPoint(x: 352 * k, y: 676 * k)); ctx.addLine(to: CGPoint(x: 440 * k, y: 762 * k)); ctx.addLine(to: CGPoint(x: 612 * k, y: 580 * k)); ctx.strokePath()
ctx.restoreGState()

let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote", out, Int(S))
