/* ------------------------------------------------------------------ *
 * Colour maths. Hand-rolled sRGB <-> CIE Lab so we can run it per
 * pixel on a big image without allocating an object each call.
 * ------------------------------------------------------------------ */

export type Lab = [number, number, number]
export type Rgb = [number, number, number]

const REF_X = 95.047
const REF_Y = 100.0
const REF_Z = 108.883

function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

function pivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)

  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) * 100
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) * 100
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) * 100

  const fx = pivot(x / REF_X)
  const fy = pivot(y / REF_Y)
  const fz = pivot(z / REF_Z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb(L: number, a: number, bb: number): Rgb {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - bb / 200

  const fx3 = fx * fx * fx
  const fz3 = fz * fz * fz
  const xr = fx3 > 0.008856 ? fx3 : (116 * fx - 16) / 903.3
  const yr = L > 903.3 * 0.008856 ? Math.pow((L + 16) / 116, 3) : L / 903.3
  const zr = fz3 > 0.008856 ? fz3 : (116 * fz - 16) / 903.3

  const x = (xr * REF_X) / 100
  const y = (yr * REF_Y) / 100
  const z = (zr * REF_Z) / 100

  const rl = x * 3.2406 + y * -1.5372 + z * -0.4986
  const gl = x * -0.9689 + y * 1.8758 + z * 0.0415
  const bl = x * 0.0557 + y * -0.204 + z * 1.057

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)]
}

export function labToHex(lab: Lab): string {
  const [r, g, b] = labToRgb(lab[0], lab[1], lab[2])
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

/** squared CIE76 distance — cheap, good enough for k-means seeding/assign */
export function labDist2(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dL * dL + da * da + db * db
}

/** relative luminance of a hex colour, for choosing black/white label text */
export function isLightHex(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}
