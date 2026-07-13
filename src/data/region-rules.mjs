/**
 * Declarative region-labeling rules, consumed by scripts/bake-labels.mjs.
 * See REGIONS.md for the frozen predicate vocabulary and change policy.
 *
 * The bake first assigns every vertex to a gross SEGMENT (head, neck,
 * torso, arm, leg — arms/legs handled per side), then walks that segment's
 * rule list top to bottom; THE FIRST MATCHING RULE WINS. Every list ends
 * with unconditional catch-alls, so labeling is total by construction.
 *
 * Predicate vocabulary (all optional; a rule matches when ALL present
 * predicates hold):
 *   y:    [lo, hi]  segment-normalized height. Anchors per segment:
 *                   torso 0=crotch line, 1=shoulder line (may exceed);
 *                   neck 0=shoulder line, 1=chin; head 0=chin, 1=crown.
 *   z:    "front" | "back"  vs the segment's per-y-slice mid-z (the body
 *                   curves; never a constant plane).
 *   ax:   [lo, hi]  |x| normalized by the segment's per-y-slice half-width.
 *   t:    [lo, hi]  limb parameter, joint-anchored: arm 0=shoulder joint,
 *                   0.45=elbow, 0.85=wrist, 1=hand tip; leg 0=hip joint,
 *                   0.5=knee, 0.9=ankle, 1=toe tip.
 *   face: [...]     limb quadrant around the bone axis: "front", "back",
 *                   "inner" (medial), "outer" (lateral). theta=0 is +z
 *                   projected perpendicular to the bone; medial sign is
 *                   normalized per side so "inner" always means toward
 *                   the body's midline.
 *   zSeg: [lo, hi]  foot-only: z as a fraction of the foot's z extent
 *                   (0=heel end, 1=toe end).
 *   nY:   [lo, hi]  vertex normal's y component (foot-only: sole/top).
 *   variants: [...] rule exists only on these body variants; on others the
 *                   surface falls through to the next rule.
 *
 * `{S}` in an id resolves to the side: for torso/head/neck rules, the
 * vertex's x sign (+x = patient's left); for arm/leg rules, the limb side.
 */

export const MIN_VERTS = 12;

export const SEGMENT_RULES = {
  head: [
    { id: "head.ear.{S}", y: [0.25, 0.75], ax: [0.72, 9] },
    { id: "head.crown", y: [0.82, 9] },
    { id: "head.back", z: "back" },
    { id: "head.temple.{S}", y: [0.45, 0.82], ax: [0.5, 9] },
    { id: "head.forehead", y: [0.58, 0.82] },
    { id: "head.eye.{S}", y: [0.4, 0.6], ax: [0.1, 9] },
    { id: "head.nose", y: [0.28, 0.6], ax: [0, 0.16] },
    { id: "head.cheek.{S}", y: [0.12, 0.4], ax: [0.16, 9] },
    { id: "head.mouth", y: [-9, 0.35], ax: [0, 0.16] },
    // catch-alls: remaining laterals/under-chin
    { id: "head.jaw.{S}", ax: [0.14, 9] },
    { id: "head.mouth" },
  ],

  neck: [
    { id: "neck.side.{S}", ax: [0.62, 9] },
    { id: "neck.throat", z: "front" },
    { id: "neck.nape" },
  ],

  torso: [
    // --- top band: collarbones (front) then trapezius owns the rest ---
    { id: "shoulder.collarbone.{S}", y: [0.93, 1.12], z: "front" },
    { id: "shoulder.trapezius.{S}", y: [0.93, 9] },
    // --- chest ---
    {
      id: "chest.breast.{S}",
      variants: ["body-b"],
      y: [0.62, 0.8],
      z: "front",
      ax: [0.08, 0.75],
    },
    { id: "chest.sternum", y: [0.62, 0.93], z: "front", ax: [0, 0.14] },
    { id: "chest.pec.{S}", y: [0.7, 0.93], z: "front" },
    { id: "chest.ribs.lower.{S}", y: [0.55, 0.7], z: "front" },
    // --- abdomen: clinical 9-zone grid ---
    { id: "abdomen.upper.center", y: [0.44, 0.55], z: "front", ax: [0, 0.2] },
    { id: "abdomen.upper.{S}", y: [0.44, 0.55], z: "front" },
    { id: "abdomen.navel", y: [0.28, 0.44], z: "front", ax: [0, 0.26] },
    { id: "abdomen.flank.{S}", y: [0.28, 0.44], z: "front" },
    { id: "abdomen.lower.center", y: [0.14, 0.28], z: "front", ax: [0, 0.2] },
    { id: "abdomen.lower.{S}", y: [0.14, 0.28], z: "front" },
    // --- pelvis & hips ---
    { id: "pelvis.pubic", y: [0.02, 0.14], z: "front", ax: [0, 0.35] },
    { id: "pelvis.groin.{S}", y: [-0.06, 0.16], z: "front", ax: [0.3, 0.85] },
    { id: "hip.side.{S}", y: [0.05, 0.32], ax: [0.8, 9] },
    // --- back ---
    { id: "back.scapula.{S}", y: [0.7, 0.93], z: "back", ax: [0.22, 9] },
    { id: "back.spine.upper", y: [0.7, 0.93], z: "back" },
    { id: "back.spine.mid", y: [0.44, 0.7], z: "back", ax: [0, 0.2] },
    { id: "back.mid.{S}", y: [0.44, 0.7], z: "back" },
    { id: "back.spine.lumbar", y: [0.24, 0.44], z: "back", ax: [0, 0.2] },
    { id: "back.lower.{S}", y: [0.24, 0.44], z: "back" },
    { id: "back.sacrum", y: [0.1, 0.24], z: "back", ax: [0, 0.3] },
    { id: "back.tailbone", y: [-0.02, 0.1], z: "back", ax: [0, 0.16] },
    { id: "back.buttock.{S}", y: [-9, 0.24], z: "back" },
    // catch-alls
    { id: "pelvis.groin.{S}", y: [-9, 0.2], z: "front" },
    { id: "abdomen.flank.{S}", z: "front" },
    { id: "back.mid.{S}" },
  ],

  arm: [
    { id: "shoulder.cap.{S}", t: [0, 0.1] },
    { id: "arm.armpit.{S}", t: [0.05, 0.3], face: ["inner"] },
    { id: "arm.biceps.{S}", t: [0.04, 0.4], face: ["front", "inner"] },
    { id: "arm.triceps.{S}", t: [0.04, 0.42] },
    { id: "arm.elbow.crease.{S}", t: [0.4, 0.5], face: ["front", "inner"] },
    { id: "arm.elbow.point.{S}", t: [0.4, 0.52] },
    { id: "arm.forearm.inner.{S}", t: [0.52, 0.8], face: ["front", "inner"] },
    { id: "arm.forearm.outer.{S}", t: [0.52, 0.82] },
    { id: "arm.wrist.{S}", t: [0.82, 0.88] },
    { id: "hand.fingers.{S}", t: [0.96, 9] },
    { id: "hand.thumb.{S}", t: [0.88, 0.96], face: ["front"] },
    // rest pose pronates the forearm: the palm faces inward-BACKWARD and
    // the dorsum faces forward-outward
    { id: "hand.palm.{S}", t: [0.88, 0.96], face: ["inner", "back"] },
    { id: "hand.back.{S}", t: [0.88, 0.96] },
    // catch-alls
    { id: "arm.triceps.{S}", t: [-9, 0.5] },
    { id: "arm.forearm.outer.{S}" },
  ],

  leg: [
    { id: "leg.thigh.front.{S}", t: [0, 0.44], face: ["front"] },
    { id: "leg.thigh.back.{S}", t: [0, 0.44], face: ["back"] },
    { id: "leg.thigh.inner.{S}", t: [0, 0.44], face: ["inner"] },
    { id: "leg.thigh.outer.{S}", t: [0, 0.44] },
    { id: "leg.knee.cap.{S}", t: [0.44, 0.56], face: ["front", "inner", "outer"] },
    { id: "leg.knee.back.{S}", t: [0.44, 0.57] },
    { id: "leg.shin.{S}", t: [0.57, 0.88], face: ["front", "inner"] },
    { id: "leg.calf.{S}", t: [0.57, 0.9] },
    { id: "leg.ankle.inner.{S}", t: [0.88, 0.93], face: ["inner", "front"] },
    { id: "leg.ankle.outer.{S}", t: [0.88, 0.93] },
    { id: "foot.toes.{S}", t: [0.93, 9], zSeg: [0.7, 9] },
    { id: "foot.heel.{S}", t: [0.93, 9], zSeg: [-9, 0.3] },
    { id: "foot.sole.{S}", t: [0.93, 9], nY: [-9, -0.35] },
    { id: "foot.top.{S}", t: [0.93, 9] },
    // catch-alls
    { id: "leg.thigh.outer.{S}", t: [-9, 0.5] },
    { id: "leg.calf.{S}" },
  ],
};
