/**
 * THE auto-fit transform: normalizes any body export to the app's proxy
 * frame — VISUAL_TARGET_HEIGHT tall, feet at y=0, bbox-centered on x/z.
 *
 * Single source of truth shared by BodyVisual (runtime, via the sibling
 * .d.mts) and scripts/glb-utils.mjs (landmark measurement + verification).
 * Landmarks/proxies and the rendered mesh MUST live in this same frame;
 * measure-body.mjs embeds the computed fit in each landmark file and
 * BodyVisual asserts its own computed fit matches in dev.
 */

export const VISUAL_TARGET_HEIGHT = 3.6;

/**
 * @param {number[]} min bbox min [x,y,z]
 * @param {number[]} max bbox max [x,y,z]
 * @returns {{ scale: number, center: [number, number, number] }}
 *   fitted point = (p - center) * scale
 */
export function computeFitFromBounds(min, max) {
  return {
    scale: VISUAL_TARGET_HEIGHT / (max[1] - min[1]),
    center: [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2],
  };
}

/** Apply a fit to a flat [x,y,z,...] position array in place. */
export function applyFitToPositions(positions, fit) {
  const [cx, cy, cz] = fit.center;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * fit.scale;
    positions[i + 1] = (positions[i + 1] - cy) * fit.scale;
    positions[i + 2] = (positions[i + 2] - cz) * fit.scale;
  }
  return positions;
}

/** Compare two fits within tolerance (relative for scale, absolute for center). */
export function fitsMatch(a, b, tolerance = 0.001) {
  if (Math.abs(a.scale - b.scale) / b.scale > tolerance) return false;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.center[i] - b.center[i]) > tolerance * VISUAL_TARGET_HEIGHT) return false;
  }
  return true;
}
