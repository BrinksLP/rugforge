/* ------------------------------------------------------------------ *
 * k-means colour reduction in Lab space.
 * Deterministic (k-means++ seeded from a fixed hash) so the same
 * image + settings always give the same pattern.
 * ------------------------------------------------------------------ */

import { labDist2, type Lab } from './color'

export interface KMeansResult {
  /** k cluster centres in Lab */
  centers: Lab[]
  /** for each input sample, the index of its cluster */
  assignments: Uint8Array
}

/** tiny deterministic PRNG (mulberry32) */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param samples flat Lab triples: [L0,a0,b0, L1,a1,b1, ...]
 * @param k       number of clusters
 */
export function kmeansLab(
  samples: Float64Array,
  k: number,
  maxIter = 30,
): KMeansResult {
  const n = samples.length / 3
  k = Math.max(1, Math.min(k, n))
  const rand = rng(0x9e3779b9 ^ n ^ (k * 2654435761))

  // ---- k-means++ seeding -----------------------------------------
  const centers: Lab[] = []
  const first = Math.floor(rand() * n)
  centers.push([samples[first * 3], samples[first * 3 + 1], samples[first * 3 + 2]])

  const d2 = new Float64Array(n).fill(Infinity)
  for (let c = 1; c < k; c++) {
    let sum = 0
    const last = centers[c - 1]
    for (let i = 0; i < n; i++) {
      const p: Lab = [samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]]
      const dd = labDist2(p, last)
      if (dd < d2[i]) d2[i] = dd
      sum += d2[i]
    }
    let target = rand() * sum
    let pick = n - 1
    for (let i = 0; i < n; i++) {
      target -= d2[i]
      if (target <= 0) {
        pick = i
        break
      }
    }
    centers.push([
      samples[pick * 3],
      samples[pick * 3 + 1],
      samples[pick * 3 + 2],
    ])
  }

  // ---- Lloyd iterations ----------------------------------------
  const assignments = new Uint8Array(n)
  const sumL = new Float64Array(k)
  const sumA = new Float64Array(k)
  const sumB = new Float64Array(k)
  const count = new Int32Array(k)

  for (let iter = 0; iter < maxIter; iter++) {
    let moved = 0
    sumL.fill(0)
    sumA.fill(0)
    sumB.fill(0)
    count.fill(0)

    for (let i = 0; i < n; i++) {
      const p: Lab = [samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dd = labDist2(p, centers[c])
        if (dd < bestD) {
          bestD = dd
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        moved++
      }
      sumL[best] += p[0]
      sumA[best] += p[1]
      sumB[best] += p[2]
      count[best]++
    }

    for (let c = 0; c < k; c++) {
      if (count[c] === 0) continue
      centers[c] = [
        sumL[c] / count[c],
        sumA[c] / count[c],
        sumB[c] / count[c],
      ]
    }

    if (moved === 0) break
  }

  return { centers, assignments }
}
