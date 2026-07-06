/**
 * Derives the full 47-region proxy layout from a measured landmark file
 * (src/data/landmarks/<variant>.json, produced by scripts/measure-body.mjs).
 *
 * Shared between the app (imported by body-variants.ts via the sibling
 * .d.mts declaration) and the Node verification scripts — one source of
 * truth for proxy geometry.
 *
 * Invariants (same as the blob era, now measured instead of hand-tuned):
 * skin across a region's zone lies INSIDE its volume with ~MARGIN outward
 * slack in every zone-facing direction; volumes stop short of the opposite
 * side's skin; where neighbors overlap, the intended region's surface is
 * nearest to the camera over its zone (breasts past chest, toes past foot,
 * ears past head, front panels past back panels' reach).
 */

const MARGIN = 0.06;

/** Euler XYZ (three.js convention) rotating +Y onto direction d. */
function eulerYTo(dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return [0, 0, 0];
  const x = dx / len, y = dy / len, z = dz / len;
  // axis = normalize(Y × d), angle = acos(Y·d)
  let ax = z, ay = 0, az = -x; // (0,1,0) × (x,y,z)
  const alen = Math.hypot(ax, ay, az);
  if (alen < 1e-8) return y > 0 ? [0, 0, 0] : [Math.PI, 0, 0];
  ax /= alen; ay /= alen; az /= alen;
  const angle = Math.acos(Math.max(-1, Math.min(1, y)));
  // Rodrigues -> row-major rotation matrix
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const m11 = t * ax * ax + c, m12 = t * ax * ay - s * az, m13 = t * ax * az + s * ay;
  const m21 = t * ax * ay + s * az, m22 = t * ay * ay + c, m23 = t * ay * az - s * ax;
  const m31 = t * ax * az - s * ay, m32 = t * ay * az + s * ax, m33 = t * az * az + c;
  // three.js Euler.setFromRotationMatrix, order XYZ
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  let ex, ez;
  if (Math.abs(m13) < 0.9999999) {
    ex = Math.atan2(-m23, m33);
    ez = Math.atan2(-m12, m11);
  } else {
    ex = Math.atan2(m32, m22);
    ez = 0;
  }
  return [ex, ey, ez];
}

function ellipsoid(cx, cy, cz, rx, ry, rz) {
  return {
    kind: "sphere",
    position: [cx, cy, cz],
    radius: ry,
    scale: [rx / ry, 1, rz / ry],
  };
}

function sphere(cx, cy, cz, r) {
  return { kind: "sphere", position: [cx, cy, cz], radius: r };
}

/**
 * Capsule spanning p1..p2. The mid-section is shortened so cap tips end
 * just past the endpoints (~0.02) instead of a full radius beyond —
 * otherwise limb capsules engulf the joint spheres at their endpoints and
 * the joints can never win the raycast (wrist/knee/ankle selection).
 */
function capsuleBetween(p1, p2, radius) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];
  const dist = Math.hypot(dx, dy, dz);
  return {
    kind: "capsule",
    position: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2],
    radius,
    length: Math.max(0.02, dist - 2 * radius + 0.04),
    rotation: eulerYTo(dx, dy, dz),
  };
}

const mirrorPoint = ([x, y, z]) => [-x, y, z];

function mirrorSpec(spec) {
  const out = { ...spec, position: mirrorPoint(spec.position) };
  if (spec.rotation) {
    // mirroring across x flips the z and y rotation components
    out.rotation = [spec.rotation[0], -spec.rotation[1], -spec.rotation[2]];
  }
  return out;
}

export function buildFigureFromLandmarks(lm) {
  const M = MARGIN;
  const figure = {};

  /* ---- head ---- */
  const headHeight = lm.height - lm.chinY;
  const headCY = (lm.height + lm.chinY) / 2;
  const headCZ = (lm.head.zMin + lm.head.zMax) / 2;
  figure["head"] = ellipsoid(
    0, headCY, headCZ,
    lm.head.halfWidth + M, headHeight / 2 + M, (lm.head.zMax - lm.head.zMin) / 2 + M,
  );
  // face features scale from the measured head; ears/eyes/jaw protrude
  // past the head volume (halfWidth + M) to win the raycast in their zones
  const earR = lm.head.halfWidth * 0.35;
  figure["head.ear.left"] = sphere(lm.head.halfWidth + 0.02, headCY, headCZ, earR);
  figure["head.ear.right"] = mirrorSpec(figure["head.ear.left"]);
  figure["head.eyes"] = ellipsoid(
    0, lm.chinY + 0.6 * headHeight, lm.head.zMax - 0.03,
    lm.head.halfWidth * 0.85, 0.08, 0.13,
  );
  const jawCz = headCZ + (lm.head.zMax - headCZ) * 0.5;
  // wide enough to own the jaw-angle / under-ear corners, or front rays
  // there slip through to the occiput's front face
  figure["head.jaw"] = ellipsoid(
    0, lm.chinY + 0.16 * headHeight, jawCz,
    lm.head.halfWidth * 1.15, 0.09, lm.head.zMax - jawCz + 0.09,
  );

  /* ---- neck ----
   * Slim tube whose cap TIPS stay between the collarbones and just under
   * the chin (a fat capsule pokes through the face and paints the cheeks),
   * tilted forward about x to follow the neck's natural lean — a vertical
   * capsule at fixed z grazes the throat and tints only its ends. */
  const neckR = lm.neck.halfWidth;
  const neckTipTop = lm.chinY - 0.01; // reaches the under-chin skin
  // reaches below the shoulder line so the sternal-notch zone can't open a
  // front hole for rays to reach the upper back
  const neckTipBot = lm.shoulder.y - 0.02;
  const neckLen = Math.max(0.04, neckTipTop - neckTipBot - 2 * neckR);
  const neckCY = (neckTipTop + neckTipBot) / 2;
  const NECK_LEAN = 0.22; // rad, top toward +z
  // z windows from the measured neck slice: front owns mid..front skin,
  // back owns back skin..mid, each with outward margin
  const neckMidZ = (lm.neck.zMin + lm.neck.zMax) / 2;
  const neckCapsule = (zBack, zFront, xScale) => ({
    kind: "capsule",
    position: [0, neckCY, (zBack + zFront) / 2],
    radius: neckR,
    length: neckLen,
    // x widened for the skull base / occiput flare above the narrow throat
    scale: [xScale, 1, (zFront - zBack) / 2 / neckR],
    rotation: [NECK_LEAN, 0, 0],
  });
  // both tubes share the occiput width: a narrower front tube would let
  // front rays at the neck's sides thread through to the back tube's face
  figure["neck.front"] = neckCapsule(neckMidZ - 0.06, lm.neck.zMax + 0.06, 1.7);
  figure["neck.back"] = neckCapsule(lm.neck.zMin - 0.12, neckMidZ + 0.02, 1.7);

  /* ---- front torso ---- */
  const chest = lm.torsoSlices.chest;
  const chestTop = lm.shoulder.y;
  const chestBot = lm.chestBotY;
  {
    const front = chest.zMax + M;
    // shallow back reach: a deep chest panel catches back-camera rays that
    // clip past the back panel's ellipsoid corner
    const backStop = chest.zMin * 0.15;
    const spec = ellipsoid(
      chest.halfWidth * 0.48, (chestTop + chestBot) / 2, (front + backStop) / 2,
      chest.halfWidth * 0.68, (chestTop - chestBot) / 2 + M * 0.8, (front - backStop) / 2,
    );
    figure["torso.chest.left.anterior"] = spec;
    figure["torso.chest.right.anterior"] = mirrorSpec(spec);
  }
  {
    // Breasts protrude past the chest panels' front so they win the raycast
    // in their zone. Radius scales from the chest band height so the breast
    // zone never blankets the whole chest — the upper chest stays ownable
    // by the chest panels.
    const r = Math.max(0.09, Math.min(0.14, (chestTop - chestBot) * 0.4));
    const front = Math.max(chest.zMax, lm.bust.zMax) + 0.06;
    // centered on the measured most-forward point of the bust slice
    const cx = lm.bust.x > 0.05 ? lm.bust.x : chest.halfWidth * 0.42;
    const spec = sphere(cx, lm.bust.y, front - r, r);
    figure["torso.chest.breast.left"] = spec;
    figure["torso.chest.breast.right"] = mirrorSpec(spec);
  }

  const waistS = lm.torsoSlices.waist;
  const hipS = lm.torsoSlices.hip;
  // the measured widest "hip line" sits at crotch height on these bodies,
  // so vertical banding uses a derived iliac-crest-ish level instead
  const pelvisTopY = lm.crotchY + 0.55 * (lm.waist.y - lm.crotchY);
  const abdTop = chestBot;
  const abdBot = pelvisTopY;
  const abdMid = (abdTop + abdBot) / 2;
  const abdRX = Math.max(waistS.halfWidth, hipS.halfWidth) + M + 0.02;
  {
    const front = waistS.zMax + M;
    const backStop = waistS.zMin * 0.3;
    figure["torso.abdomen.upper.anterior"] = ellipsoid(
      0, (abdTop + abdMid) / 2, (front + backStop) / 2,
      abdRX, (abdTop - abdMid) / 2 + M * 0.7, (front - backStop) / 2,
    );
    const frontL = Math.max(waistS.zMax, hipS.zMax) + M;
    const backStopL = Math.min(waistS.zMin, hipS.zMin) * 0.3;
    figure["torso.abdomen.lower.anterior"] = ellipsoid(
      0, (abdMid + abdBot) / 2, (frontL + backStopL) / 2,
      abdRX, (abdMid - abdBot) / 2 + M * 0.7, (frontL - backStopL) / 2,
    );
  }

  const pelvisS = lm.torsoSlices.pelvis;
  {
    const front = pelvisS.zMax + M;
    const backStop = pelvisS.zMin * 0.25;
    figure["torso.pelvis.anterior"] = ellipsoid(
      0, (pelvisTopY + lm.crotchY) / 2, (front + backStop) / 2,
      lm.hip.halfWidth * 0.8, (pelvisTopY - lm.crotchY) / 2 + M * 0.6, (front - backStop) / 2,
    );
    // reaches below the crotch so front rays at the perineum/inner-thigh
    // line hit groin, not the lower back's grown bottom
    figure["torso.groin"] = ellipsoid(
      0, lm.crotchY - 0.04, pelvisS.zMax * 0.3,
      lm.hip.halfWidth * 0.4, 0.16, pelvisS.zMax * 0.5 + 0.12,
    );
  }

  /* ---- back torso ---- */
  const midBack = (lm.armpitY + lm.waist.y) / 2;
  {
    const backReach = chest.zMin - M;
    const frontStop = chest.zMax * 0.3;
    // wide and tall enough that back-camera rays can't clip past the
    // ellipsoid corner into front panels' rear faces
    const backUpTop = lm.shoulder.y + 0.08;
    const backUpBot = midBack - 0.06;
    figure["torso.back.upper"] = ellipsoid(
      0, (backUpTop + backUpBot) / 2, (frontStop + backReach) / 2,
      Math.max(chest.halfWidth + 0.1, lm.shoulder.halfWidth),
      (backUpTop - backUpBot) / 2 + M * 1.5,
      (frontStop - backReach) / 2,
    );
    // deep back margin: the glutes protrude past the waist/hip slice
    // measurements taken above them
    const backReachL = Math.min(waistS.zMin, hipS.zMin) - 0.14;
    // strictly behind the front volumes' faces even at their thin flank
    // corners, so front-camera flank rays never claim the lower back
    const frontStopL = waistS.zMax * 0.3 - 0.05;
    // reaches below the crotch line: a gap here lets back-camera rays sail
    // through the buttock zone to front volumes (groin), and the gluteal
    // fold needs the ellipsoid's bottom corner to stay thick
    const backLowBot = lm.crotchY - 0.12;
    figure["torso.back.lower"] = ellipsoid(
      0, (midBack + backLowBot) / 2, (frontStopL + backReachL) / 2,
      abdRX, (midBack - backLowBot) / 2 + M * 1.2, (frontStopL - backReachL) / 2,
    );
  }

  /* ---- shoulders & arms (left measured, right mirrored) ---- */
  {
    // Shoulder owns the deltoid cap AND the trapezius slope (pain-map
    // convention: neck<->shoulder gap belongs to the shoulder side).
    // Inner edge stops just off the neck tube; the front face stops short
    // of the chest panel so upper-chest taps keep resolving to chest;
    // the back face stays shallower than back.upper so scapula taps from
    // behind resolve to the upper back.
    const innerX = 0.1;
    const outerX = lm.shoulder.halfWidth * 1.35;
    const zFront = chest.zMax - 0.02;
    const zBack = Math.min(-0.42, chest.zMin - 0.05);
    const spec = ellipsoid(
      (innerX + outerX) / 2, lm.shoulder.y + 0.08, (zFront + zBack) / 2,
      (outerX - innerX) / 2, 0.24, (zFront - zBack) / 2,
    );
    figure["shoulder.left"] = spec;
    figure["shoulder.right"] = mirrorSpec(spec);
  }
  {
    // two-segment arm polyline — the rest pose has elbow flexion, so upper
    // arm and forearm have different axes. The upper arm runs from the
    // shoulder joint (acromion-derived, NOT the below-armpit sample, which
    // would compress the capsule to a stub) down to the measured elbow.
    const top = [
      lm.shoulder.halfWidth * 0.85,
      lm.shoulder.y - 0.04,
      lm.arm.top[2],
    ];
    const elbowP = lm.arm.elbow;
    const wrist = lm.arm.wrist;
    // z-deepened: the posterior axillary fold / triceps bulge belongs to
    // the upper arm (pain-map convention for the arm-torso border)
    const upper = {
      ...capsuleBetween(top, elbowP, lm.arm.radius + 0.05),
      scale: [1, 1, 1.5],
    };
    // forearm bows forward of the straight elbow->wrist axis: shifted and
    // widened toward +z only, so it doesn't shadow the torso flank behind
    const fore = {
      ...capsuleBetween(
        [elbowP[0], elbowP[1], elbowP[2] + 0.05],
        [wrist[0], wrist[1], wrist[2] + 0.05],
        lm.arm.radius + 0.07,
      ),
      scale: [1, 1, 1.35],
    };
    figure["arm.upper.left"] = upper;
    figure["arm.upper.right"] = mirrorSpec(upper);
    figure["arm.elbow.left"] = {
      ...sphere(...elbowP, lm.arm.radius + 0.09),
      scale: [1, 1, 1.3],
    };
    figure["arm.elbow.right"] = mirrorSpec(figure["arm.elbow.left"]);
    figure["arm.fore.left"] = fore;
    figure["arm.fore.right"] = mirrorSpec(fore);
    figure["arm.wrist.left"] = sphere(...wrist, lm.arm.wristRadius + 0.1);
    figure["arm.wrist.right"] = mirrorSpec(figure["arm.wrist.left"]);

    // hand continues along the forearm direction below the wrist; a tall
    // ellipsoid whose front face beats the wrist sphere so palm taps
    // resolve to the hand
    const handTopY = lm.arm.wristY - 0.02;
    const handBotY = lm.arm.handBottomY;
    const handMidY = (handTopY + handBotY) / 2;
    const s = (wrist[1] - handMidY) / Math.max(0.01, elbowP[1] - wrist[1]);
    const handX = wrist[0] + (wrist[0] - elbowP[0]) * s;
    const handRy = (handTopY - handBotY) / 2 + 0.03;
    figure["hand.left"] = {
      ...sphere(handX, handMidY, lm.arm.hand.cz, handRy),
      scale: [0.13 / handRy, 1, (lm.arm.hand.zHalf + 0.1) / handRy],
    };
    figure["hand.right"] = mirrorSpec(figure["hand.left"]);
    // fingers: distal third, protruding below and in front of the hand
    const fingers = {
      ...sphere(handX, handBotY + 0.05, lm.arm.hand.cz + 0.02, 0.1),
      scale: [1.2, 1, (lm.arm.hand.zHalf + 0.12) / 0.1],
    };
    figure["hand.fingers.left"] = fingers;
    figure["hand.fingers.right"] = mirrorSpec(fingers);
  }

  /* ---- hips & legs ---- */
  {
    // lateral reach capped at skin + margin: an overreaching hip volume
    // intercepts rays headed for the forearm hanging beside it
    const hipInner = lm.hip.halfWidth * 0.35;
    const hipOuter = lm.hip.halfWidth + 0.1;
    const spec = ellipsoid(
      (hipInner + hipOuter) / 2, (pelvisTopY + lm.crotchY) / 2, (hipS.zMax + hipS.zMin) / 2,
      (hipOuter - hipInner) / 2, (pelvisTopY - lm.crotchY) / 2 + M,
      (hipS.zMax - hipS.zMin) / 2 + 0.12,
    );
    figure["hip.left"] = spec;
    figure["hip.right"] = mirrorSpec(spec);
  }
  {
    // leg chain at measured z centers — in the fitted frame the legs sit
    // well behind z=0 (the bbox z-center is skewed by the forward hands)
    const leg = lm.leg;
    const thighTopP = [leg.topX, lm.crotchY + 0.04, leg.topZ];
    const kneeP = [leg.knee.x, leg.knee.y, leg.knee.z];
    const ankleP = [leg.ankle.x, leg.ankle.y, leg.ankle.z];
    // extra radius so the thick upper thigh's front face stays inside
    const thigh = capsuleBetween(thighTopP, kneeP, leg.thigh.radius + 0.09);
    figure["leg.upper.left"] = thigh;
    figure["leg.upper.right"] = mirrorSpec(thigh);
    figure["leg.knee.left"] = sphere(...kneeP, leg.knee.radius + M + 0.02);
    figure["leg.knee.right"] = mirrorSpec(figure["leg.knee.left"]);

    // calf = back of the lower leg, shin = front: same knee->ankle axis.
    // Each owns ~60% of the measured leg depth (overlapping in the middle),
    // protruding past its own face and stopping short of the opposite one;
    // the z half-extent comes from a z-scale on the capsule.
    const calfDepth = leg.calf.zMax - leg.calf.zMin;
    const calfCz = (leg.calf.zMax + leg.calf.zMin) / 2;
    const r = leg.calf.radius + 0.05;
    // lower-leg capsules stop above the ankle so the ankle sphere owns its
    // band instead of being shadowed by the shin/calf end caps
    const lower = (zBack, zFront) => {
      const cz = (zBack + zFront) / 2;
      const spec = capsuleBetween(
        [kneeP[0], kneeP[1], cz],
        [ankleP[0], ankleP[1] + 0.08, cz],
        r,
      );
      return { ...spec, scale: [1, 1, (zFront - zBack) / 2 / r] };
    };
    figure["leg.calf.left"] = lower(leg.calf.zMin - 0.05, calfCz + 0.12 * calfDepth);
    figure["leg.calf.right"] = mirrorSpec(figure["leg.calf.left"]);
    figure["leg.shin.left"] = lower(calfCz - 0.12 * calfDepth, leg.calf.zMax + 0.05);
    figure["leg.shin.right"] = mirrorSpec(figure["leg.shin.left"]);

    figure["leg.ankle.left"] = sphere(...ankleP, leg.ankle.radius + 0.055);
    figure["leg.ankle.right"] = mirrorSpec(figure["leg.ankle.left"]);
  }
  {
    const f = lm.foot;
    const footCz = (f.zMin + f.zMax) / 2;
    const spec = ellipsoid(
      f.centerX, f.topY * 0.45, footCz,
      f.halfWidth + 0.05, f.topY * 0.55 + 0.03, (f.zMax - f.zMin) / 2 + M * 0.8,
    );
    figure["foot.left"] = spec;
    figure["foot.right"] = mirrorSpec(spec);
    // toes protrude past the foot volume's front
    const toes = ellipsoid(f.centerX, f.topY * 0.3, f.zMax - 0.04, f.halfWidth * 0.9, 0.07, 0.12);
    figure["foot.toes.left"] = toes;
    figure["foot.toes.right"] = mirrorSpec(toes);
  }

  return figure;
}
