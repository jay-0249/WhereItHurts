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

/*
 * Proxy volumes have three jobs: raycast target, tint volume for the
 * fragment-shader highlight, and pin centroid. They only need to ENCLOSE
 * their body zone with comfortable overlap — the highlight renders on the
 * visual mesh itself, so proxies exceeding the silhouette is harmless.
 * What matters: front zones must jointly cover the front surface (and back
 * zones the back) with no ray-through gaps, and where volumes overlap in
 * depth, the intended region's surface must be nearest to the camera.
 */
export const FIGURE: Record<RegionId, RegionMeshSpec> = {
  head: { kind: "sphere", position: [0, 3.28, 0], radius: 0.29 },
  "head.ear.left": { kind: "sphere", position: [0.24, 3.28, 0], radius: 0.06 },
  "head.ear.right": { kind: "sphere", position: [-0.24, 3.28, 0], radius: 0.06 },
  "head.eyes": {
    kind: "sphere", position: [0, 3.32, 0.24], radius: 0.09, scale: [1.6, 0.6, 0.6],
  },
  "head.jaw": {
    kind: "sphere", position: [0, 3.08, 0.14], radius: 0.1, scale: [1.4, 0.6, 0.9],
  },
  "neck.front": { kind: "capsule", position: [0, 2.92, 0.04], radius: 0.075, length: 0.14 },
  "neck.back": { kind: "capsule", position: [0, 2.92, -0.04], radius: 0.075, length: 0.14 },
  // Chest panels overlap across the midline, reach the neck, and cover the
  // full torso width so no front-facing ray can slip through to a back
  // proxy or fall into a lateral dead zone.
  "torso.chest.left.anterior": {
    kind: "sphere", position: [0.17, 2.5, 0.12], radius: 0.3, scale: [0.9, 1.1, 0.5],
  },
  "torso.chest.right.anterior": {
    kind: "sphere", position: [-0.17, 2.5, 0.12], radius: 0.3, scale: [0.9, 1.1, 0.5],
  },
  // Breast proxies must protrude past the chest panels' front surface
  // (z 0.29 > chest 0.26 at that x/y) or the chest always wins the raycast.
  "torso.chest.breast.left": { kind: "sphere", position: [0.16, 2.38, 0.19], radius: 0.1 },
  "torso.chest.breast.right": { kind: "sphere", position: [-0.16, 2.38, 0.19], radius: 0.1 },
  "torso.abdomen.upper.anterior": {
    kind: "sphere", position: [0, 2.1, 0.1], radius: 0.3, scale: [1.4, 0.65, 0.5],
  },
  "torso.abdomen.lower.anterior": {
    kind: "sphere", position: [0, 1.78, 0.1], radius: 0.3, scale: [1.4, 0.65, 0.5],
  },
  "torso.pelvis.anterior": {
    kind: "sphere", position: [0, 1.54, 0.1], radius: 0.24, scale: [1, 0.55, 0.5],
  },
  "torso.groin": {
    kind: "sphere", position: [0, 1.43, 0.05], radius: 0.1, scale: [0.8, 0.5, 0.5],
  },
  // Back panels sit deep enough that even where they graze the midplane,
  // the front panels' surfaces are always nearer for a front-facing ray.
  "torso.back.upper": {
    kind: "sphere", position: [0, 2.5, -0.12], radius: 0.32, scale: [1.35, 0.95, 0.45],
  },
  "torso.back.lower": {
    kind: "sphere", position: [0, 1.98, -0.12], radius: 0.32, scale: [1.25, 0.85, 0.45],
  },
  "shoulder.left": { kind: "sphere", position: [0.45, 2.7, 0], radius: 0.12 },
  "shoulder.right": { kind: "sphere", position: [-0.45, 2.7, 0], radius: 0.12 },
  "arm.upper.left": { kind: "capsule", position: [0.55, 2.3, 0], radius: 0.085, length: 0.35 },
  "arm.upper.right": { kind: "capsule", position: [-0.55, 2.3, 0], radius: 0.085, length: 0.35 },
  "arm.elbow.left": { kind: "sphere", position: [0.55, 2.05, 0], radius: 0.088 },
  "arm.elbow.right": { kind: "sphere", position: [-0.55, 2.05, 0], radius: 0.088 },
  "arm.fore.left": { kind: "capsule", position: [0.55, 1.8, 0], radius: 0.08, length: 0.3 },
  "arm.fore.right": { kind: "capsule", position: [-0.55, 1.8, 0], radius: 0.08, length: 0.3 },
  "arm.wrist.left": { kind: "sphere", position: [0.55, 1.57, 0], radius: 0.08 },
  "arm.wrist.right": { kind: "sphere", position: [-0.55, 1.57, 0], radius: 0.08 },
  "hand.left": { kind: "sphere", position: [0.57, 1.48, 0], radius: 0.08 },
  "hand.right": { kind: "sphere", position: [-0.57, 1.48, 0], radius: 0.08 },
  "hand.fingers.left": {
    kind: "sphere", position: [0.57, 1.38, 0], radius: 0.05, scale: [1.2, 1, 1],
  },
  "hand.fingers.right": {
    kind: "sphere", position: [-0.57, 1.38, 0], radius: 0.05, scale: [1.2, 1, 1],
  },
  "hip.left": { kind: "sphere", position: [0.2, 1.6, 0], radius: 0.16, scale: [1, 0.9, 1.4] },
  "hip.right": { kind: "sphere", position: [-0.2, 1.6, 0], radius: 0.16, scale: [1, 0.9, 1.4] },
  "leg.upper.left": { kind: "capsule", position: [0.2, 1.15, 0], radius: 0.115, length: 0.35 },
  "leg.upper.right": { kind: "capsule", position: [-0.2, 1.15, 0], radius: 0.115, length: 0.35 },
  "leg.knee.left": { kind: "sphere", position: [0.2, 0.9, 0], radius: 0.11 },
  "leg.knee.right": { kind: "sphere", position: [-0.2, 0.9, 0], radius: 0.11 },
  // calf = back of the lower leg, shin = front; split on z
  "leg.calf.left": { kind: "capsule", position: [0.2, 0.62, -0.035], radius: 0.09, length: 0.3 },
  "leg.calf.right": { kind: "capsule", position: [-0.2, 0.62, -0.035], radius: 0.09, length: 0.3 },
  "leg.shin.left": { kind: "capsule", position: [0.2, 0.62, 0.035], radius: 0.09, length: 0.3 },
  "leg.shin.right": { kind: "capsule", position: [-0.2, 0.62, 0.035], radius: 0.09, length: 0.3 },
  "leg.ankle.left": { kind: "sphere", position: [0.2, 0.33, 0], radius: 0.09 },
  "leg.ankle.right": { kind: "sphere", position: [-0.2, 0.33, 0], radius: 0.09 },
  "foot.left": {
    kind: "sphere", position: [0.2, 0.09, 0.08], radius: 0.115, scale: [0.8, 0.55, 1.4],
  },
  "foot.right": {
    kind: "sphere", position: [-0.2, 0.09, 0.08], radius: 0.115, scale: [0.8, 0.55, 1.4],
  },
  "foot.toes.left": {
    kind: "sphere", position: [0.2, 0.07, 0.2], radius: 0.055, scale: [1.3, 0.75, 1],
  },
  "foot.toes.right": {
    kind: "sphere", position: [-0.2, 0.07, 0.2], radius: 0.055, scale: [1.3, 0.75, 1],
  },
};

export function regionCentroid(id: RegionId): readonly [number, number, number] {
  return FIGURE[id].position;
}
