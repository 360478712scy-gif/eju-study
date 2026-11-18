// 澄学 EJU 3.0 app icon: a frosted orb inside a ring of radial ticks over a night sky.
// Full-bleed square (macOS applies its own mask). Usage: swift make_icon.swift <out.png> [size]
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

let full = CGRect(x: 0, y: 0, width: S, height: S)
// sky
ctx.setFillColor(c(14, 20, 44)); ctx.fill(full)
ctx.drawLinearGradient(grad([(0, c(38, 62, 122)), (0.55, c(18, 28, 64)), (1, c(8, 11, 26))]), start: CGPoint(x: S * 0.3, y: 0), end: CGPoint(x: S * 0.7, y: S), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
// aurora-ish glow behind the orb
ctx.drawRadialGradient(grad([(0, c(110, 160, 255, 0.55)), (0.45, c(70, 110, 230, 0.18)), (1, c(40, 60, 160, 0))]), startCenter: CGPoint(x: 512 * k, y: 500 * k), startRadius: 0, endCenter: CGPoint(x: 512 * k, y: 500 * k), endRadius: 520 * k, options: [])
ctx.drawRadialGradient(grad([(0, c(255, 190, 220, 0.16)), (1, c(255, 190, 220, 0))]), startCenter: CGPoint(x: 830 * k, y: 860 * k), startRadius: 0, endCenter: CGPoint(x: 830 * k, y: 860 * k), endRadius: 420 * k, options: [])

// snow / stars (deterministic)
var seed: UInt64 = 0x9E3779B97F4A7C15
func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat((seed >> 33) % 100000) / 100000 }
for _ in 0..<90 {
  let x = rnd() * S, y = rnd() * S, r = (0.6 + rnd() * 2.6) * k, a = 0.12 + rnd() * 0.5
  let d = hypot(x - 512 * k, y - 512 * k)
  if d < 420 * k { continue }
  ctx.setFillColor(c(255, 255, 255, a))
  ctx.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
}

let C = CGPoint(x: 512 * k, y: 512 * k)
// tick ring
let ticks = 120, lit = 46
ctx.setLineCap(.round)
for i in 0..<ticks {
  let a = CGFloat(i) / CGFloat(ticks) * .pi * 2 - .pi / 2
  let long = i % 10 == 0
  let r1 = 338 * k, r2 = (long ? 392 : 376) * k
  let p1 = CGPoint(x: C.x + cos(a) * r1, y: C.y + sin(a) * r1)
  let p2 = CGPoint(x: C.x + cos(a) * r2, y: C.y + sin(a) * r2)
  ctx.saveGState()
  if i < lit {
    ctx.setShadow(offset: .zero, blur: 14 * k, color: c(140, 200, 255, 0.9))
    ctx.setStrokeColor(c(214, 236, 255, 0.98))
    ctx.setLineWidth((long ? 9 : 7) * k)
  } else {
    ctx.setStrokeColor(c(255, 255, 255, long ? 0.3 : 0.18))
    ctx.setLineWidth((long ? 8 : 6) * k)
  }
  ctx.move(to: p1); ctx.addLine(to: p2); ctx.strokePath()
  ctx.restoreGState()
}

// orb shadow
let R = 262 * k
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 34 * k), blur: 70 * k, color: c(0, 4, 20, 0.7))
ctx.setFillColor(c(30, 40, 70))
ctx.fillEllipse(in: CGRect(x: C.x - R, y: C.y - R, width: R * 2, height: R * 2))
ctx.restoreGState()

// orb body
ctx.saveGState()
ctx.addEllipse(in: CGRect(x: C.x - R, y: C.y - R, width: R * 2, height: R * 2)); ctx.clip()
let hl = CGPoint(x: C.x - R * 0.36, y: C.y - R * 0.44)
ctx.drawRadialGradient(grad([(0, c(255, 255, 255)), (0.16, c(226, 236, 252)), (0.42, c(150, 168, 204)), (0.74, c(58, 72, 108)), (1, c(16, 22, 42))]), startCenter: hl, startRadius: 0, endCenter: C, endRadius: R * 1.08, options: [.drawsAfterEndLocation])
// cool reflection lower right
ctx.drawRadialGradient(grad([(0, c(120, 175, 255, 0.55)), (1, c(120, 175, 255, 0))]), startCenter: CGPoint(x: C.x + R * 0.5, y: C.y + R * 0.62), startRadius: 0, endCenter: CGPoint(x: C.x + R * 0.5, y: C.y + R * 0.62), endRadius: R * 0.8, options: [])
// frosted bands
ctx.setBlendMode(.screen)
ctx.drawLinearGradient(grad([(0, c(255, 255, 255, 0)), (0.5, c(255, 255, 255, 0.08)), (1, c(255, 255, 255, 0))]), start: CGPoint(x: C.x - R, y: C.y + R * 0.1), end: CGPoint(x: C.x + R, y: C.y - R * 0.3), options: [])
ctx.setBlendMode(.normal)
// soft specular highlight (elliptical radial)
ctx.saveGState()
ctx.translateBy(x: hl.x + R * 0.02, y: hl.y + R * 0.02); ctx.rotate(by: -0.5); ctx.scaleBy(x: 1.0, y: 0.62)
ctx.setBlendMode(.screen)
ctx.drawRadialGradient(grad([(0, c(255, 255, 255, 0.85)), (0.35, c(255, 255, 255, 0.35)), (1, c(255, 255, 255, 0))]), startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: R * 0.42, options: [])
ctx.restoreGState()
// inner shade bottom
ctx.drawRadialGradient(grad([(0.7, c(0, 0, 0, 0)), (1, c(0, 6, 24, 0.5))]), startCenter: CGPoint(x: C.x - R * 0.2, y: C.y - R * 0.25), startRadius: 0, endCenter: C, endRadius: R, options: [])
ctx.restoreGState()
// rim
ctx.setStrokeColor(c(220, 235, 255, 0.5))
ctx.setLineWidth(3 * k)
ctx.strokeEllipse(in: CGRect(x: C.x - R, y: C.y - R, width: R * 2, height: R * 2).insetBy(dx: 1.5 * k, dy: 1.5 * k))

let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote", out, Int(S))
