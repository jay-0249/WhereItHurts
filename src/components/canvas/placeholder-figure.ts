import type { RegionId } from "@/data/regions";

/**
 * Placeholder proxy volumes: one primitive per region, keyed to region IDs.
 * Coordinates: y up, ground at y=0, figure faces +z (toward the default
 * camera), so anatomical left = +x. Positions double as pin anchors.
 *
 * Proxy volumes have three jobs: raycast target, tint volume for the
 * fragment-shader highlight, and pin centroid.
 *
 * CONTAINMENT INVARIANT: the visual mesh's skin across a region's zone must
 * lie fully INSIDE its volume, protruding outward past the skin by ~0.05+
 * in every direction the zone faces — otherwise the tint disconnects into
 * patches where the skin exits the volume. The flip-side constraint: a
 * volume must NOT reach the opposite side's skin (e.g. a front panel must
 * stop short of the back surface) or its tint bleeds through to the other
 * side. Where neighbors overlap, raycast hit order decides: the intended
 * region's surface must be nearest to the camera over its zone (front
 * panels protrude further forward than back panels reach, breasts protrude
 * past chest, toes past foot, ears past head). Verify with ?proxies=1 —
 * every colored volume should visibly poke out of the body over its zone.
 * Numbers derived from the blob dimensions in scripts/make-placeholder-body.mjs.
 */
export interface RegionMeshSpec {
  kind: "sphere" | "capsule";
  position: readonly [number, number, number];
  radius: number;
  /** capsule mid-section length */
  length?: number;
  /** non-uniform scale turning spheres into zone-shaped ellipsoids */
  scale?: readonly [number, number, number];
}

export const FIGURE: Record<RegionId, RegionMeshSpec> = {
  // Head volume encloses the whole head; ears/eyes/jaw protrude past it to
  // win the raycast in their zones.
  head: { kind: "sphere", position: [0, 3.28, 0], radius: 0.36 },
  "head.ear.left": { kind: "sphere", position: [0.28, 3.28, 0], radius: 0.12 },
  "head.ear.right": { kind: "sphere", position: [-0.28, 3.28, 0], radius: 0.12 },
  "head.eyes": {
    kind: "sphere", position: [0, 3.3, 0.22], radius: 0.09, scale: [1.9, 0.8, 1.9],
  },
  "head.jaw": {
    kind: "sphere", position: [0, 3.06, 0.14], radius: 0.1, scale: [1.7, 0.7, 1.8],
  },
  "neck.front": { kind: "capsule", position: [0, 2.92, 0.05], radius: 0.13, length: 0.16 },
  "neck.back": { kind: "capsule", position: [0, 2.92, -0.05], radius: 0.13, length: 0.16 },
  // Front torso panels protrude well past the front skin (z 0.26) and stop
  // short of the back skin (-0.26); back panels mirror that.
  "torso.chest.left.anterior": {
    kind: "sphere", position: [0.2, 2.52, 0.1], radius: 0.3, scale: [1.05, 1.2, 0.85],
  },
  "torso.chest.right.anterior": {
    kind: "sphere", position: [-0.2, 2.52, 0.1], radius: 0.3, scale: [1.05, 1.2, 0.85],
  },
  // Breast volumes protrude past the chest panels' front faces to win the
  // raycast in their zone (body-b only).
  "torso.chest.breast.left": { kind: "sphere", position: [0.16, 2.38, 0.25], radius: 0.15 },
  "torso.chest.breast.right": { kind: "sphere", position: [-0.16, 2.38, 0.25], radius: 0.15 },
  "torso.abdomen.upper.anterior": {
    kind: "sphere", position: [0, 2.1, 0.08], radius: 0.3, scale: [1.65, 0.75, 0.95],
  },
  "torso.abdomen.lower.anterior": {
    kind: "sphere", position: [0, 1.78, 0.08], radius: 0.3, scale: [1.65, 0.7, 0.95],
  },
  "torso.pelvis.anterior": {
    kind: "sphere", position: [0, 1.55, 0.08], radius: 0.24, scale: [1.15, 0.65, 1.0],
  },
  "torso.groin": {
    kind: "sphere", position: [0, 1.42, 0.05], radius: 0.1, scale: [1.6, 0.9, 2.2],
  },
  "torso.back.upper": {
    kind: "sphere", position: [0, 2.52, -0.08], radius: 0.32, scale: [1.55, 1.15, 0.85],
  },
  "torso.back.lower": {
    kind: "sphere", position: [0, 1.95, -0.08], radius: 0.32, scale: [1.55, 1.0, 0.85],
  },
  "shoulder.left": {
    kind: "sphere", position: [0.45, 2.7, 0], radius: 0.19, scale: [1, 1, 1.15],
  },
  "shoulder.right": {
    kind: "sphere", position: [-0.45, 2.7, 0], radius: 0.19, scale: [1, 1, 1.15],
  },
  // Arm volumes: outer margin generous; inner radius stops just past the
  // torso flank (x 0.414) so arm tint doesn't bleed onto the waist.
  "arm.upper.left": { kind: "capsule", position: [0.55, 2.3, 0], radius: 0.125, length: 0.38 },
  "arm.upper.right": { kind: "capsule", position: [-0.55, 2.3, 0], radius: 0.125, length: 0.38 },
  "arm.elbow.left": { kind: "sphere", position: [0.55, 2.05, 0], radius: 0.13 },
  "arm.elbow.right": { kind: "sphere", position: [-0.55, 2.05, 0], radius: 0.13 },
  "arm.fore.left": { kind: "capsule", position: [0.55, 1.79, 0], radius: 0.12, length: 0.32 },
  "arm.fore.right": { kind: "capsule", position: [-0.55, 1.79, 0], radius: 0.12, length: 0.32 },
  "arm.wrist.left": { kind: "sphere", position: [0.55, 1.56, 0], radius: 0.115 },
  "arm.wrist.right": { kind: "sphere", position: [-0.55, 1.56, 0], radius: 0.115 },
  "hand.left": { kind: "sphere", position: [0.57, 1.47, 0], radius: 0.15 },
  "hand.right": { kind: "sphere", position: [-0.57, 1.47, 0], radius: 0.15 },
  "hand.fingers.left": {
    kind: "sphere", position: [0.57, 1.35, 0], radius: 0.09, scale: [1.2, 0.9, 1.1],
  },
  "hand.fingers.right": {
    kind: "sphere", position: [-0.57, 1.35, 0], radius: 0.09, scale: [1.2, 0.9, 1.1],
  },
  // Hip wraps the side laterally; front/back center belong to pelvis and
  // lower back, which protrude further along z in their zones.
  "hip.left": {
    kind: "sphere", position: [0.22, 1.6, 0], radius: 0.16, scale: [1.5, 1.1, 1.9],
  },
  "hip.right": {
    kind: "sphere", position: [-0.22, 1.6, 0], radius: 0.16, scale: [1.5, 1.1, 1.9],
  },
  "leg.upper.left": { kind: "capsule", position: [0.2, 1.15, 0], radius: 0.19, length: 0.35 },
  "leg.upper.right": { kind: "capsule", position: [-0.2, 1.15, 0], radius: 0.19, length: 0.35 },
  "leg.knee.left": { kind: "sphere", position: [0.2, 0.9, 0], radius: 0.17 },
  "leg.knee.right": { kind: "sphere", position: [-0.2, 0.9, 0], radius: 0.17 },
  // calf = back of the lower leg, shin = front; each stops short of the
  // opposite face's skin so tints stay on their own side
  "leg.calf.left": { kind: "capsule", position: [0.2, 0.62, -0.045], radius: 0.155, length: 0.3 },
  "leg.calf.right": { kind: "capsule", position: [-0.2, 0.62, -0.045], radius: 0.155, length: 0.3 },
  "leg.shin.left": { kind: "capsule", position: [0.2, 0.62, 0.045], radius: 0.155, length: 0.3 },
  "leg.shin.right": { kind: "capsule", position: [-0.2, 0.62, 0.045], radius: 0.155, length: 0.3 },
  "leg.ankle.left": { kind: "sphere", position: [0.2, 0.33, 0], radius: 0.15 },
  "leg.ankle.right": { kind: "sphere", position: [-0.2, 0.33, 0], radius: 0.15 },
  "foot.left": {
    kind: "sphere", position: [0.2, 0.09, 0.09], radius: 0.13, scale: [1.1, 0.8, 1.9],
  },
  "foot.right": {
    kind: "sphere", position: [-0.2, 0.09, 0.09], radius: 0.13, scale: [1.1, 0.8, 1.9],
  },
  // Toes protrude past the foot volume's front to win the raycast there.
  "foot.toes.left": {
    kind: "sphere", position: [0.2, 0.07, 0.24], radius: 0.08, scale: [1.5, 0.8, 1.5],
  },
  "foot.toes.right": {
    kind: "sphere", position: [-0.2, 0.07, 0.24], radius: 0.08, scale: [1.5, 0.8, 1.5],
  },
};

export function regionCentroid(id: RegionId): readonly [number, number, number] {
  return FIGURE[id].position;
}
