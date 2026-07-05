import type { RegionId } from "@/data/regions";

/**
 * Placeholder capsule-and-sphere humanoid (PLANNING.md §6 build order rule:
 * validate raycast selection, confirm loop, and pins against a placeholder
 * segmented figure BEFORE investing in the real mesh).
 *
 * Each region is one primitive mesh keyed to a region ID. Coordinates:
 * y up, ground at y=0, figure faces +z (toward the default camera), so
 * anatomical left = +x. Positions double as pin anchors (region centroids).
 */
export interface RegionMeshSpec {
  kind: "sphere" | "capsule";
  position: readonly [number, number, number];
  radius: number;
  /** capsule mid-section length */
  length?: number;
  /** non-uniform scale for flattened torso panels and feet */
  scale?: readonly [number, number, number];
}

export const FIGURE: Record<RegionId, RegionMeshSpec> = {
  head: { kind: "sphere", position: [0, 3.28, 0], radius: 0.32 },
  "neck.front": { kind: "capsule", position: [0, 2.92, 0.08], radius: 0.1, length: 0.14 },
  "neck.back": { kind: "capsule", position: [0, 2.92, -0.08], radius: 0.1, length: 0.14 },
  "torso.chest.left.anterior": {
    kind: "sphere", position: [0.19, 2.5, 0.12], radius: 0.3, scale: [0.8, 1, 0.5],
  },
  "torso.chest.right.anterior": {
    kind: "sphere", position: [-0.19, 2.5, 0.12], radius: 0.3, scale: [0.8, 1, 0.5],
  },
  "torso.abdomen.anterior": {
    kind: "sphere", position: [0, 1.98, 0.12], radius: 0.32, scale: [1.15, 0.85, 0.45],
  },
  "torso.back.upper": {
    kind: "sphere", position: [0, 2.5, -0.12], radius: 0.32, scale: [1.3, 0.95, 0.45],
  },
  "torso.back.lower": {
    kind: "sphere", position: [0, 1.98, -0.12], radius: 0.32, scale: [1.15, 0.85, 0.45],
  },
  "shoulder.left": { kind: "sphere", position: [0.47, 2.72, 0], radius: 0.16 },
  "shoulder.right": { kind: "sphere", position: [-0.47, 2.72, 0], radius: 0.16 },
  "arm.left": { kind: "capsule", position: [0.56, 2.12, 0], radius: 0.11, length: 0.85 },
  "arm.right": { kind: "capsule", position: [-0.56, 2.12, 0], radius: 0.11, length: 0.85 },
  "hand.left": { kind: "sphere", position: [0.58, 1.48, 0], radius: 0.12 },
  "hand.right": { kind: "sphere", position: [-0.58, 1.48, 0], radius: 0.12 },
  "hip.left": { kind: "sphere", position: [0.2, 1.62, 0], radius: 0.17 },
  "hip.right": { kind: "sphere", position: [-0.2, 1.62, 0], radius: 0.17 },
  "leg.upper.left": { kind: "capsule", position: [0.2, 1.18, 0], radius: 0.145, length: 0.45 },
  "leg.upper.right": { kind: "capsule", position: [-0.2, 1.18, 0], radius: 0.145, length: 0.45 },
  "leg.lower.left": { kind: "capsule", position: [0.2, 0.55, 0], radius: 0.11, length: 0.5 },
  "leg.lower.right": { kind: "capsule", position: [-0.2, 0.55, 0], radius: 0.11, length: 0.5 },
  "foot.left": {
    kind: "sphere", position: [0.2, 0.1, 0.1], radius: 0.13, scale: [0.85, 0.6, 1.6],
  },
  "foot.right": {
    kind: "sphere", position: [-0.2, 0.1, 0.1], radius: 0.13, scale: [0.85, 0.6, 1.6],
  },
};

export function regionCentroid(id: RegionId): readonly [number, number, number] {
  return FIGURE[id].position;
}
