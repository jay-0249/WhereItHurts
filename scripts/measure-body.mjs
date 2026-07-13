/**
 * Extracts body landmarks from the generated GLBs by y-slicing vertex
 * positions (in app space, i.e. after the auto-fit transform), and writes
 * one committed JSON landmark file per variant into src/data/landmarks/.
 * The proxy layout is derived from these landmarks at runtime by
 * src/data/figure-from-landmarks.mjs.
 *
 *     node scripts/measure-body.mjs
 *
 * Landmarks are measured on the anatomical-left (+x) side and mirrored by
 * the builder. Sanity asserts fail loudly if ordering or pose is off.
 * The mesh is decimated (~15k tris), so slices are thick (0.04H) and limb
 * stats use direct min/max in x-windows rather than fragile clustering.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assert,
  assertIdentityNodes,
  autoFit,
  parseGlb,
  readPositions,
  TARGET_HEIGHT,
} from "./glb-utils.mjs";
import { buildFigureFromLandmarks } from "../src/data/figure-from-landmarks.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptsDir, "out");
const landmarksDir = path.join(scriptsDir, "..", "src", "data", "landmarks");

const H = TARGET_HEIGHT;
const BAND = 0.04 * H;
const X_GAP = 0.05;

function bandVerts(positions, y, band = BAND) {
  const out = [];
  const yLo = y - band / 2;
  const yHi = y + band / 2;
  for (let i = 0; i < positions.length; i += 3) {
    const vy = positions[i + 1];
    if (vy >= yLo && vy <= yHi) out.push([positions[i], positions[i + 2]]);
  }
  return out;
}

/** min/max stats of vertices whose x lies in (xLo, xHi) within a y band. */
function windowStats(positions, y, xLo, xHi, band = BAND) {
  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity, n = 0;
  for (const [x, z] of bandVerts(positions, y, band)) {
    if (x > xLo && x < xHi) {
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      n++;
    }
  }
  if (n < 3) return null;
  return {
    cx: (xMin + xMax) / 2,
    halfWidth: (xMax - xMin) / 2,
    xMin, xMax,
    zMin, zMax,
    cz: (zMin + zMax) / 2,
    count: n,
  };
}

/** x-contiguous segments (gap clustering) of a y band. */
function segmentsInBand(positions, y, band = BAND) {
  const verts = bandVerts(positions, y, band).sort((a, b) => a[0] - b[0]);
  const segments = [];
  let current = null;
  for (const [x, z] of verts) {
    if (!current || x - current.xMax > X_GAP) {
      current = { xMin: x, xMax: x, zMin: z, zMax: z, count: 0 };
      segments.push(current);
    }
    current.xMax = x;
    current.zMin = Math.min(current.zMin, z);
    current.zMax = Math.max(current.zMax, z);
    current.count++;
  }
  for (const s of segments) {
    s.cx = (s.xMin + s.xMax) / 2;
    s.halfWidth = (s.xMax - s.xMin) / 2;
  }
  return segments;
}

const round = (v) => +v.toFixed(4);

function measure(name) {
  const { json, bin } = parseGlb(path.join(outDir, `${name}.glb`));
  assertIdentityNodes(json, name);
  const { positions, fit } = autoFit(readPositions(json, bin));
  console.log(
    `${name}: auto-fit scale=${fit.scale.toFixed(6)} center=[${fit.center.map((c) => c.toFixed(6)).join(", ")}]`,
  );

  // widest half-extent of the shoulder zone (above the waist so wide hips
  // can't inflate it) — arm thresholds scale from it so narrow-shouldered
  // variants don't fall under absolute cutoffs
  let maxHalfWidth = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > 0.62 * H) {
      maxHalfWidth = Math.max(maxHalfWidth, Math.abs(positions[i]));
    }
  }

  // armpit: highest y where the left arm is an isolated cluster (above it
  // the arm merges with the torso at the shoulder). Below 0.55H the
  // threshold tightens so sparse outer-thigh fragments can't masquerade
  // as arm samples; a minimum count filters decimation noise.
  const isolatedArm = (y) => {
    const xThreshold = (y < 0.55 * H ? 0.78 : 0.6) * maxHalfWidth;
    return (
      segmentsInBand(positions, y).findLast(
        (s) => s.xMin > xThreshold && s.count >= 6,
      ) ?? null
    );
  };
  let armpitY = null;
  for (let y = 0.85 * H; y >= 0.5 * H; y -= BAND / 4) {
    if (isolatedArm(y)) {
      armpitY = y;
      break;
    }
  }
  assert(armpitY, `${name}: armpit not found`);

  // shoulder line (acromion/deltoid): a fixed anatomical offset above the
  // armpit. "Widest extent above armpit" is WRONG here: with arms tilted
  // outward, arm x-width increases downward, so the widest slice always
  // pins to the scan window's bottom (nipple height) and drags every
  // shoulder-derived level down a full region.
  const shoulderY = Math.min(armpitY + 0.09 * H, 0.95 * H);
  const shoulder = {
    y: shoulderY,
    halfWidth: Math.max(
      ...bandVerts(positions, shoulderY).map(([x]) => Math.abs(x)),
    ),
  };

  // crotch: lowest y where a segment spans the midline
  let crotchY = null;
  for (let y = 0.38 * H; y <= 0.62 * H; y += BAND / 4) {
    const seg = segmentsInBand(positions, y).find(
      (s) => s.xMin < -0.02 && s.xMax > 0.02,
    );
    if (seg) {
      crotchY = y;
      break;
    }
  }
  assert(crotchY, `${name}: crotch not found`);

  // torso slices: direct stats in an x window (chest window is tighter to
  // exclude the arm root)
  const torsoAt = (y, xCut = 0.4) => {
    const stats = windowStats(positions, y, -xCut, xCut);
    assert(stats, `${name}: torso slice at y=${y.toFixed(2)}`);
    return stats;
  };

  // waist: narrowest torso between crotch and armpit; hip: widest below waist
  let waist = { y: 0, halfWidth: Infinity };
  for (let y = crotchY + 0.06 * H; y <= armpitY - 0.03 * H; y += BAND / 4) {
    const s = torsoAt(y);
    if (s.halfWidth < waist.halfWidth) waist = { y, halfWidth: s.halfWidth };
  }
  let hip = { y: 0, halfWidth: 0 };
  for (let y = crotchY; y <= waist.y; y += BAND / 4) {
    const s = torsoAt(y);
    if (s.halfWidth > hip.halfWidth) hip = { y, halfWidth: s.halfWidth };
  }

  // legs: direct stats; the x window below the hands (y < 0.45H) is wide
  const legAt = (y) => {
    const xHi = y < 0.2 * H ? 0.65 : 0.5;
    return windowStats(positions, y, 0.02, xHi);
  };
  let ankle = { y: 0, halfWidth: Infinity, stats: null };
  for (let y = 0.05 * H; y <= 0.12 * H; y += BAND / 4) {
    const s = legAt(y);
    if (s && s.halfWidth < ankle.halfWidth) ankle = { y, halfWidth: s.halfWidth, stats: s };
  }
  // the narrowest-width slice sits below the knee (upper shin), so the knee
  // joint uses the anatomical fraction of the leg span instead
  const kneeY = ankle.y + 0.53 * (crotchY - ankle.y);
  const kneeStats = legAt(kneeY);
  const knee = { y: kneeY, stats: kneeStats };
  const thighY = (crotchY + knee.y) / 2;
  const calfY = (knee.y + ankle.y) / 2;
  const thighStats = legAt(thighY);
  const calfStats = legAt(calfY);
  const legTopStats = legAt(crotchY + 0.02 * H);
  assert(
    thighStats && calfStats && legTopStats && knee.stats && ankle.stats,
    `${name}: leg slices`,
  );

  // arm line: isolated arm cluster centroids, least-squares fit over y
  const armSamples = [];
  for (let y = 0.4 * H; y <= armpitY; y += BAND / 4) {
    const arm = isolatedArm(y);
    if (arm) {
      armSamples.push({
        y,
        cx: arm.cx,
        cz: (arm.zMin + arm.zMax) / 2,
        zHalf: (arm.zMax - arm.zMin) / 2,
        halfWidth: arm.halfWidth,
      });
    }
  }
  assert(armSamples.length > 5, `${name}: arm samples (${armSamples.length})`);
  // slicing loses the thin decimated hand below the wrist, so the sampled
  // minimum under-measures badly; use anatomical hand length (~0.10H)
  // from the wrist unless the samples genuinely reach lower
  const sampledBottomY = Math.min(...armSamples.map((s) => s.y));
  // wrist = narrowest arm slice ABOVE the hand (roughly one hand-length up
  // from the lowest arm sample). Searching just above the bottom finds the
  // narrowest FINGER slice instead and mislabels the fingertips as the
  // wrist — the 15k mesh masked this by losing the hand entirely.
  let wrist = { y: 0, halfWidth: Infinity };
  for (const s of armSamples) {
    if (
      s.y >= sampledBottomY + 0.07 * H &&
      s.y <= sampledBottomY + 0.14 * H &&
      s.halfWidth < wrist.halfWidth
    ) {
      wrist = { y: s.y, halfWidth: s.halfWidth };
    }
  }
  // trust the measured fingertip line when the implied hand length is
  // anatomically plausible; otherwise fall back to ~0.10H below the wrist
  const measuredHandLen = wrist.y - sampledBottomY;
  const handBottomY =
    measuredHandLen >= 0.06 * H && measuredHandLen <= 0.16 * H
      ? sampledBottomY
      : wrist.y - 0.1 * H;
  // The rest pose has natural elbow flexion (forearm angles forward, hands
  // in front of the thighs), so the arm is a two-segment polyline through
  // measured slice centroids, not one straight line.
  const sampleNearest = (y) =>
    armSamples.reduce((best, s) =>
      Math.abs(s.y - y) < Math.abs(best.y - y) ? s : best,
    );
  // top point sits below the armpit web (whose fold skews centroids back)
  const topSample = sampleNearest(armpitY - 0.04 * H);
  const wristSample = sampleNearest(wrist.y);
  // elbow: under the rest pose's flexion, the elbow is the most-BACKWARD
  // point of the hanging arm (the olecranon) — measured from the samples'
  // z-profile, not estimated from height fractions
  const elbowLo = wrist.y + 0.04 * H;
  const elbowHi = Math.max(elbowLo + 0.06 * H, armpitY - 0.06 * H);
  let elbowSample = null;
  for (const s of armSamples) {
    if (s.y >= elbowLo && s.y <= elbowHi) {
      if (!elbowSample || s.cz < elbowSample.cz) elbowSample = s;
    }
  }
  assert(elbowSample, `${name}: elbow sample not found`);
  const point = (s) => [round(s.cx), round(s.y), round(s.cz)];
  const segAngle = (a, b) =>
    (Math.atan(Math.hypot(b.cx - a.cx, b.cz - a.cz) / Math.abs(a.y - b.y)) * 180) / Math.PI;
  const upperAngleDeg = segAngle(topSample, elbowSample);
  const foreAngleDeg = segAngle(elbowSample, wristSample);
  // lateral (x) tilt is the A-pose measure; z-curvature is elbow flexion
  const upperAngleXDeg =
    (Math.atan(
      Math.abs(elbowSample.cx - topSample.cx) /
        Math.max(0.05, Math.abs(topSample.y - elbowSample.y)),
    ) * 180) / Math.PI;
  const upperSamples = armSamples.filter((s) => s.y >= elbowSample.y);
  const armRadius =
    upperSamples.reduce((a, s) => a + s.halfWidth, 0) / upperSamples.length;
  const handSample = sampleNearest(sampledBottomY + 0.025 * H);

  // neck / chin / head — the narrowest slice above the shoulders is the
  // neck (a wider x-window would catch the trapezius slope instead);
  // its z-range grounds the front/back capsule depths
  let neck = { y: 0, halfWidth: Infinity, zMin: 0, zMax: 0 };
  for (let y = shoulder.y + 0.02 * H; y <= 0.93 * H; y += BAND / 4) {
    const s = windowStats(positions, y, -0.25, 0.25);
    if (s && s.halfWidth < neck.halfWidth) {
      neck = { y, halfWidth: s.halfWidth, zMin: s.zMin, zMax: s.zMax };
    }
  }
  let chinY = null;
  for (let y = neck.y; y <= H - 0.02 * H; y += BAND / 4) {
    const s = windowStats(positions, y, -0.25, 0.25);
    if (s && s.halfWidth > neck.halfWidth * 1.25) {
      chinY = y;
      break;
    }
  }
  assert(chinY, `${name}: chin not found`);
  const head = { halfWidth: 0, zMin: Infinity, zMax: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] >= chinY) {
      head.halfWidth = Math.max(head.halfWidth, Math.abs(positions[i]));
      head.zMin = Math.min(head.zMin, positions[i + 2]);
      head.zMax = Math.max(head.zMax, positions[i + 2]);
    }
  }

  // chest region spans shoulder line down to well below the armpit (the
  // pec/bust zone) — the slice is taken mid-band, not at armpit level
  const chestBotY = waist.y + 0.25 * (armpitY - waist.y);
  const chestY = (shoulder.y + chestBotY) / 2;
  const sliceOut = (s, y) => ({
    y: round(y),
    halfWidth: round(s.halfWidth),
    zMin: round(s.zMin),
    zMax: round(s.zMax),
  });
  const chestSlice = torsoAt(chestY, 0.36);
  const waistSlice = torsoAt(waist.y);
  const hipSlice = torsoAt(hip.y);
  // mid-pelvis, NOT (hip+crotch)/2: the measured hip line can sit at crotch
  // height, where there is no center-front skin between the thighs
  const pelvisSliceY = crotchY + 0.275 * (waist.y - crotchY);
  const pelvisSlice = torsoAt(pelvisSliceY);

  // bust: most protruding torso slice between waist and just under the
  // shoulder line (the armpit measures low, so capping there misses the
  // real bust line); x = the most-forward vertex's x on the left side
  let bust = { y: 0, zMax: -Infinity, x: 0 };
  for (let y = waist.y; y <= shoulderY - 0.05; y += BAND / 4) {
    const s = torsoAt(y, 0.36);
    // meaningful-improvement threshold: the thick measuring band smears the
    // apex into a plateau, and float dust would walk the argmax to its top
    if (s.zMax > bust.zMax + 0.003) bust = { y: round(y), zMax: round(s.zMax), x: 0 };
  }
  {
    let bestZ = -Infinity;
    for (const [x, z] of bandVerts(positions, bust.y)) {
      if (x > 0.02 && x < 0.36 && z > bestZ) {
        bestZ = z;
        bust.x = round(x);
      }
    }
  }

  // foot: left-side vertices below the ankle zone
  const foot = { centerX: 0, halfWidth: 0, zMin: Infinity, zMax: -Infinity, topY: 0.055 * H };
  {
    let xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const x = positions[i];
      if (y <= 0.055 * H && x > 0.02) {
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        foot.zMin = Math.min(foot.zMin, positions[i + 2]);
        foot.zMax = Math.max(foot.zMax, positions[i + 2]);
      }
    }
    foot.centerX = round((xMin + xMax) / 2);
    foot.halfWidth = round((xMax - xMin) / 2);
    foot.zMin = round(foot.zMin);
    foot.zMax = round(foot.zMax);
    foot.topY = round(foot.topY);
  }

  const landmarks = {
    variant: name,
    height: H,
    fit: {
      scale: +fit.scale.toFixed(6),
      center: fit.center.map((c) => +c.toFixed(6)),
    },
    armpitY: round(armpitY),
    shoulder: { y: round(shoulder.y), halfWidth: round(shoulder.halfWidth) },
    crotchY: round(crotchY),
    chestBotY: round(chestBotY),
    waist: { y: round(waist.y), halfWidth: round(waist.halfWidth) },
    hip: { y: round(hip.y), halfWidth: round(hip.halfWidth) },
    torsoSlices: {
      chest: sliceOut(chestSlice, chestY),
      waist: sliceOut(waistSlice, waist.y),
      hip: sliceOut(hipSlice, hip.y),
      pelvis: sliceOut(pelvisSlice, pelvisSliceY),
    },
    bust,
    neck: {
      y: round(neck.y),
      halfWidth: round(neck.halfWidth),
      zMin: round(neck.zMin),
      zMax: round(neck.zMax),
    },
    chinY: round(chinY),
    head: {
      halfWidth: round(head.halfWidth),
      zMin: round(head.zMin),
      zMax: round(head.zMax),
    },
    arm: {
      wristY: round(wristSample.y),
      wristRadius: round(wrist.halfWidth),
      handBottomY: round(handBottomY),
      radius: round(armRadius),
      upperAngleDeg: round(upperAngleDeg),
      foreAngleDeg: round(foreAngleDeg),
      top: point(topSample),
      elbow: point(elbowSample),
      wrist: point(wristSample),
      hand: { cz: round(handSample.cz), zHalf: round(handSample.zHalf) },
    },
    // legs carry measured z centers: in the fitted frame (bbox-centered on
    // z including the forward-hanging hands) the legs sit well behind z=0
    leg: {
      topX: round(legTopStats.cx),
      topZ: round(legTopStats.cz),
      thigh: {
        y: round(thighY), x: round(thighStats.cx), z: round(thighStats.cz),
        radius: round(thighStats.halfWidth),
      },
      knee: {
        y: round(knee.y), x: round(knee.stats.cx), z: round(knee.stats.cz),
        radius: round(knee.stats.halfWidth),
      },
      calf: {
        y: round(calfY), x: round(calfStats.cx), radius: round(calfStats.halfWidth),
        zMin: round(calfStats.zMin), zMax: round(calfStats.zMax),
      },
      ankle: {
        y: round(ankle.y), x: round(ankle.stats.cx), z: round(ankle.stats.cz),
        radius: round(ankle.stats.halfWidth),
      },
    },
    foot,
  };

  assert(
    shoulder.y > armpitY && armpitY > waist.y && waist.y > hip.y &&
      hip.y > knee.y && knee.y > ankle.y,
    `${name}: landmark ordering shoulder>armpit>waist>hip>knee>ankle`,
  );
  // lateral verticality is the arms-down check (the pose is slightly
  // A-posed); z-curvature comes from the rest pose's elbow flexion and is
  // followed by the proxy capsules rather than asserted away
  assert(
    upperAngleXDeg <= 20,
    `${name}: upper arm lateral tilt within 20 deg (got ${upperAngleXDeg.toFixed(1)})`,
  );
  // the rest pose's true elbow flexion measures ~52 deg once the elbow is
  // located by z-curvature rather than height fractions
  assert(
    foreAngleDeg <= 60,
    `${name}: forearm within 60 deg of vertical (got ${foreAngleDeg.toFixed(1)})`,
  );
  // facing check is relative to the ankle: the bbox z-center is skewed by
  // the forward-hanging hands, so absolute z signs can't be trusted
  assert(
    foot.zMax - ankle.stats.cz > ankle.stats.cz - foot.zMin,
    `${name}: figure faces +z (toes extend forward of the ankle)`,
  );

  return landmarks;
}

mkdirSync(landmarksDir, { recursive: true });
for (const name of ["body-a", "body-b"]) {
  const landmarks = measure(name);
  const dest = path.join(landmarksDir, `${name}.json`);
  writeFileSync(dest, JSON.stringify(landmarks, null, 2) + "\n");
  console.log(`\n${name}: landmarks -> ${dest}`);
  console.log(
    `  shoulder y=${landmarks.shoulder.y} hw=${landmarks.shoulder.halfWidth} | ` +
      `armpit ${landmarks.armpitY} | waist ${landmarks.waist.y} | hip ${landmarks.hip.y} | ` +
      `crotch ${landmarks.crotchY} | knee ${landmarks.leg.knee.y} | ankle ${landmarks.leg.ankle.y} | ` +
      `arm upper ${landmarks.arm.upperAngleDeg} deg / fore ${landmarks.arm.foreAngleDeg} deg`,
  );

  // derived proxy table (verification output)
  const figure = buildFigureFromLandmarks(landmarks);
  console.log(`  region                             center                extents`);
  for (const [id, spec] of Object.entries(figure)) {
    const [px, py, pz] = spec.position;
    const s = spec.scale ?? [1, 1, 1];
    const ext =
      spec.kind === "capsule"
        ? [spec.radius * s[0], (spec.length ?? 0) / 2 + spec.radius * s[1], spec.radius * s[2]]
        : [spec.radius * s[0], spec.radius * s[1], spec.radius * s[2]];
    console.log(
      `  ${id.padEnd(34)} ${[px, py, pz].map((v) => v.toFixed(2)).join(",").padEnd(20)} ` +
        `${ext.map((v) => v.toFixed(2)).join(",")}`,
    );
  }
}
console.log("\nlandmarks measured; variant-difference hard check lives in verify-bodies.mjs");
