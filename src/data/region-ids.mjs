/**
 * Canonical region-id data, shared between the app (via regions.ts) and
 * the Node bake/verification scripts. Pure data — no logic beyond what a
 * script needs to enumerate ids. See REGIONS.md for the taxonomy spec.
 */

export const REGION_IDS = [
  // ---- head & face (15) ----
  "head.crown",
  "head.back",
  "head.forehead",
  "head.temple.left",
  "head.temple.right",
  "head.eye.left",
  "head.eye.right",
  "head.ear.left",
  "head.ear.right",
  "head.cheek.left",
  "head.cheek.right",
  "head.nose",
  "head.mouth",
  "head.jaw.left",
  "head.jaw.right",
  // ---- neck (4) ----
  "neck.throat",
  "neck.side.left",
  "neck.side.right",
  "neck.nape",
  // ---- shoulder girdle (6) ----
  "shoulder.collarbone.left",
  "shoulder.collarbone.right",
  "shoulder.trapezius.left",
  "shoulder.trapezius.right",
  "shoulder.cap.left",
  "shoulder.cap.right",
  // ---- chest (7) ----
  "chest.sternum",
  "chest.pec.left",
  "chest.pec.right",
  "chest.breast.left",
  "chest.breast.right",
  "chest.ribs.lower.left",
  "chest.ribs.lower.right",
  // ---- abdomen: the clinical 9-zone grid (9) ----
  "abdomen.upper.right",
  "abdomen.upper.center",
  "abdomen.upper.left",
  "abdomen.flank.right",
  "abdomen.navel",
  "abdomen.flank.left",
  "abdomen.lower.right",
  "abdomen.lower.center",
  "abdomen.lower.left",
  // ---- pelvis & groin (3) ----
  "pelvis.pubic",
  "pelvis.groin.left",
  "pelvis.groin.right",
  // ---- back (13) ----
  "back.spine.upper",
  "back.scapula.left",
  "back.scapula.right",
  "back.mid.left",
  "back.mid.right",
  "back.spine.mid",
  "back.spine.lumbar",
  "back.lower.left",
  "back.lower.right",
  "back.sacrum",
  "back.tailbone",
  "back.buttock.left",
  "back.buttock.right",
  // ---- hips (2) ----
  "hip.side.left",
  "hip.side.right",
  // ---- arms (12 per side) ----
  "arm.armpit.left",
  "arm.armpit.right",
  "arm.biceps.left",
  "arm.biceps.right",
  "arm.triceps.left",
  "arm.triceps.right",
  "arm.elbow.crease.left",
  "arm.elbow.crease.right",
  "arm.elbow.point.left",
  "arm.elbow.point.right",
  "arm.forearm.inner.left",
  "arm.forearm.inner.right",
  "arm.forearm.outer.left",
  "arm.forearm.outer.right",
  "arm.wrist.left",
  "arm.wrist.right",
  "hand.palm.left",
  "hand.palm.right",
  "hand.back.left",
  "hand.back.right",
  "hand.thumb.left",
  "hand.thumb.right",
  "hand.fingers.left",
  "hand.fingers.right",
  // ---- legs (14 per side) ----
  "leg.thigh.front.left",
  "leg.thigh.front.right",
  "leg.thigh.back.left",
  "leg.thigh.back.right",
  "leg.thigh.inner.left",
  "leg.thigh.inner.right",
  "leg.thigh.outer.left",
  "leg.thigh.outer.right",
  "leg.knee.cap.left",
  "leg.knee.cap.right",
  "leg.knee.back.left",
  "leg.knee.back.right",
  "leg.shin.left",
  "leg.shin.right",
  "leg.calf.left",
  "leg.calf.right",
  "leg.ankle.inner.left",
  "leg.ankle.inner.right",
  "leg.ankle.outer.left",
  "leg.ankle.outer.right",
  "foot.heel.left",
  "foot.heel.right",
  "foot.sole.left",
  "foot.sole.right",
  "foot.top.left",
  "foot.top.right",
  "foot.toes.left",
  "foot.toes.right",
];

/** Regions available only on specific body variants. */
export const REGION_VARIANTS = {
  "chest.breast.left": ["body-b"],
  "chest.breast.right": ["body-b"],
};

/**
 * Adjacency is auto-derived at bake time (regions sharing >= 3 mesh
 * edges); these overrides add clinically useful non-touching neighbor
 * chips and remove mesh-artifact adjacencies. Pairs are symmetric.
 */
export const ADJACENCY_OVERRIDES = {
  add: [
    ["hip.side.left", "hip.side.right"],
    ["back.spine.lumbar", "abdomen.navel"],
    ["leg.knee.cap.left", "leg.knee.back.left"],
    ["leg.knee.cap.right", "leg.knee.back.right"],
  ],
  remove: [],
};
