/**
 * Region-label bake: assigns EVERY mesh vertex a region id from the
 * declarative rules in src/data/region-rules.mjs, embeds the labels into
 * the GLB as a `_REGION` vertex attribute, and writes the per-variant
 * region manifest (anchors, AABBs, adjacency, counts).
 *
 *     node scripts/bake-labels.mjs        (aka: npm run bake)
 *
 * Reads the PRISTINE Blender exports in scripts/out/ (regenerate with
 * generate-bodies.py if missing) and writes labeled GLBs to public/assets/.
 * Labeling is total by construction (per-segment catch-all rules) and the
 * bake FAILS LOUDLY on any invariant violation. See REGIONS.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assert,
  assertIdentityNodes,
  autoFit,
  parseGlb,
  readIndices,
  readPositions,
} from "./glb-utils.mjs";
import { fitsMatch } from "../src/lib/body-fit.mjs";
import {
  ADJACENCY_OVERRIDES,
  REGION_IDS,
  REGION_VARIANTS,
} from "../src/data/region-ids.mjs";
import { MIN_VERTS, SEGMENT_RULES } from "../src/data/region-rules.mjs";

const H = 3.6;
const CLEANUP_MIN_COMPONENT = 8;
const ADJACENCY_MIN_EDGES = 3;
const SYMMETRY_TOLERANCE = 0.25;

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptsDir, "out");
const assetsDir = path.join(scriptsDir, "..", "public", "assets");
const manifestDir = path.join(scriptsDir, "..", "src", "data", "region-manifest");
const landmarksDir = path.join(scriptsDir, "..", "src", "data", "landmarks");

const REGION_INDEX = new Map(REGION_IDS.map((id, i) => [id, i]));

/* ---------------- small vector helpers (plain arrays) ---------------- */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Closest point parameters on segment p0..p1: { s in [0,1], dist, point }. */
function closestOnSegment(p, p0, p1) {
  const d = sub(p1, p0);
  const l2 = dot(d, d) || 1e-12;
  const s = Math.max(0, Math.min(1, dot(sub(p, p0), d) / l2));
  const point = add(p0, scale3(d, s));
  return { s, dist: len(sub(p, point)), point };
}

/* ---------------- gross segmentation structures ---------------- */

const SEGMENT_PRIORITY = ["torso", "head", "neck", "armL", "armR", "legL", "legR"];

function mirrorPoint(p) {
  return [-p[0], p[1], p[2]];
}

function buildStructures(lm) {
  const midOf = (s) => (s.zMin + s.zMax) / 2;
  const t = lm.torsoSlices;
  const headCz = (lm.head.zMin + lm.head.zMax) / 2;
  const neckMid = (lm.neck.zMin + lm.neck.zMax) / 2;

  // torso: polyline down the body axis with a landmark-derived radius profile
  // top cap narrows sharply at the shoulder line so the neck structure —
  // not the torso — claims the neck column (trapezius stays torso: it is
  // lateral, outside the slim neck axis radius)
  // the below-crotch point exists to catch the glutes; it is biased BACK
  // and slim so it does not also swallow the inner thighs at the front
  const torsoPts = [
    [0, lm.crotchY - 0.22, t.hip.zMin - 0.05],
    [0, lm.crotchY, midOf(t.pelvis)],
    [0, lm.waist.y, midOf(t.waist)],
    [0, t.chest.y, midOf(t.chest)],
    [0, lm.shoulder.y, midOf(t.chest)],
  ];
  const torsoRadii = [
    lm.hip.halfWidth * 0.7,
    lm.hip.halfWidth,
    lm.waist.halfWidth,
    t.chest.halfWidth + 0.03,
    t.chest.halfWidth * 0.7,
  ];

  // arm polyline: shoulder joint -> elbow -> wrist -> hand tip
  const sj = [lm.shoulder.halfWidth * 0.85, lm.shoulder.y - 0.02, lm.arm.top[2]];
  const elbow = lm.arm.elbow;
  const wrist = lm.arm.wrist;
  // the hand hangs DOWN from the wrist — extrapolating the forearm's
  // forward diagonal puts the tip far in front of the actual fingers and
  // collapses every hand vertex to t~0.85. Aim at the measured hand slice.
  const tipY = lm.arm.handBottomY - 0.03;
  const tip = [
    wrist[0] + (wrist[0] - elbow[0]) * 0.15,
    tipY,
    lm.arm.hand.cz,
  ];
  const armPts = [sj, elbow, wrist, tip];
  const armR = lm.arm.radius + 0.02;

  // leg polyline: hip joint -> knee -> ankle -> toe tip
  const leg = lm.leg;
  const legPts = [
    [leg.topX, lm.crotchY + 0.02, leg.topZ],
    [leg.knee.x, leg.knee.y, leg.knee.z],
    [leg.ankle.x, leg.ankle.y, leg.ankle.z],
    [lm.foot.centerX, 0.05, lm.foot.zMax],
  ];
  const legRadii = [
    [leg.thigh.radius + 0.02, leg.knee.radius + 0.02],
    [leg.knee.radius + 0.02, leg.ankle.radius + 0.02],
    [leg.ankle.radius + 0.02, 0.09],
  ];

  const polyline = (pts, radii) => ({
    bones: pts.slice(0, -1).map((p, i) => ({
      p0: p,
      p1: pts[i + 1],
      r0: Array.isArray(radii) ? radii[i][0] : radii,
      r1: Array.isArray(radii) ? radii[i][1] : radii,
    })),
  });
  const torsoBones = torsoPts.slice(0, -1).map((p, i) => ({
    p0: p,
    p1: torsoPts[i + 1],
    r0: torsoRadii[i],
    r1: torsoRadii[i + 1],
  }));

  return {
    torso: { bones: torsoBones },
    head: polyline([[0, lm.chinY, headCz], [0, H, headCz]], lm.head.halfWidth),
    neck: polyline(
      [[0, lm.shoulder.y, neckMid], [0, lm.chinY, neckMid]],
      lm.neck.halfWidth * 1.3,
    ),
    armL: polyline(armPts, armR),
    armR: polyline(armPts.map(mirrorPoint), armR),
    legL: polyline(legPts, legRadii),
    legR: polyline(legPts.map(mirrorPoint), legRadii),
  };
}

/** score = distance to structure surface (dist to polyline minus radius). */
function structureScore(p, structure) {
  let best = Infinity;
  for (const bone of structure.bones) {
    const { s, dist } = closestOnSegment(p, bone.p0, bone.p1);
    const r = bone.r0 + (bone.r1 - bone.r0) * s;
    if (dist - r < best) best = dist - r;
  }
  return best;
}

/* ---------------- main ---------------- */

function bake(variant) {
  const srcPath = path.join(outDir, `${variant}.glb`);
  assert(
    existsSync(srcPath),
    `${variant}: pristine export ${srcPath} missing — run the generation ` +
      `pipeline first (blender --background --python scripts/generate-bodies.py -- ${variant})`,
  );
  const lm = JSON.parse(
    readFileSync(path.join(landmarksDir, `${variant}.json`), "utf8"),
  );

  const { json, bin } = parseGlb(srcPath);
  assertIdentityNodes(json, variant);
  assert(json.meshes?.length === 1, `${variant}: exactly 1 mesh`);
  assert(json.meshes[0].primitives.length === 1, `${variant}: exactly 1 primitive`);
  const prim = json.meshes[0].primitives[0];
  assert(prim.indices !== undefined, `${variant}: indexed geometry`);

  const { positions, fit } = autoFit(readPositions(json, bin));
  assert(
    fitsMatch(fit, lm.fit),
    `${variant}: landmark fit stale — re-run scripts/measure-body.mjs`,
  );
  const indices = readIndices(json, bin, prim);
  const n = positions.length / 3;
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

  // vertex normals (area-weighted accumulation)
  const normals = new Float32Array(n * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
    const pa = P(a), pb = P(b), pc = P(c);
    const e1 = sub(pb, pa), e2 = sub(pc, pa);
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const v of [a, b, c]) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]) || 1;
    normals[v * 3] /= l;
    normals[v * 3 + 1] /= l;
    normals[v * 3 + 2] /= l;
  }

  // vertex adjacency (for cleanup + region adjacency)
  const neighbors = Array.from({ length: n }, () => new Set());
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }

  /* ---- stage 1: gross segmentation ---- */
  const structures = buildStructures(lm);
  const segNames = SEGMENT_PRIORITY;
  const segments = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const p = P(v);
    let bestSeg = 0;
    let bestScore = Infinity;
    for (let s = 0; s < segNames.length; s++) {
      const score = structureScore(p, structures[segNames[s]]);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        bestSeg = s;
      }
    }
    segments[v] = bestSeg;
  }

  // cleanup: merge tiny same-segment connected components into their
  // dominant neighboring segment (deterministic: components discovered in
  // ascending vertex order)
  {
    const compId = new Int32Array(n).fill(-1);
    const comps = [];
    for (let v = 0; v < n; v++) {
      if (compId[v] !== -1) continue;
      const seg = segments[v];
      const stack = [v];
      const members = [];
      compId[v] = comps.length;
      while (stack.length) {
        const u = stack.pop();
        members.push(u);
        for (const w of neighbors[u]) {
          if (compId[w] === -1 && segments[w] === seg) {
            compId[w] = comps.length;
            stack.push(w);
          }
        }
      }
      comps.push(members);
    }
    for (const members of comps) {
      if (members.length >= CLEANUP_MIN_COMPONENT) continue;
      const counts = new Map();
      for (const u of members) {
        for (const w of neighbors[u]) {
          if (segments[w] !== segments[u]) {
            counts.set(segments[w], (counts.get(segments[w]) ?? 0) + 1);
          }
        }
      }
      let winner = segments[members[0]];
      let best = -1;
      for (const [seg, count] of [...counts.entries()].sort((x, y) => x[0] - y[0])) {
        if (count > best) {
          best = count;
          winner = seg;
        }
      }
      for (const u of members) segments[u] = winner;
    }
  }

  /* ---- per-segment slice stats (half-width + mid-z per y bin) ---- */
  const BIN_COUNT = 60;
  function sliceStats(segIdxs) {
    let yMin = Infinity, yMax = -Infinity;
    for (const s of segIdxs) {
      for (let v = 0; v < n; v++) {
        if (segments[v] !== s) continue;
        const y = positions[v * 3 + 1];
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
    const span = Math.max(1e-6, yMax - yMin);
    const hw = new Array(BIN_COUNT).fill(0);
    const zMin = new Array(BIN_COUNT).fill(Infinity);
    const zMax = new Array(BIN_COUNT).fill(-Infinity);
    for (let v = 0; v < n; v++) {
      if (!segIdxs.includes(segments[v])) continue;
      const bin = Math.min(
        BIN_COUNT - 1,
        Math.floor(((positions[v * 3 + 1] - yMin) / span) * BIN_COUNT),
      );
      hw[bin] = Math.max(hw[bin], Math.abs(positions[v * 3]));
      zMin[bin] = Math.min(zMin[bin], positions[v * 3 + 2]);
      zMax[bin] = Math.max(zMax[bin], positions[v * 3 + 2]);
    }
    // fill empty bins from nearest filled
    for (let b = 0; b < BIN_COUNT; b++) {
      if (zMin[b] !== Infinity) continue;
      for (let d = 1; d < BIN_COUNT; d++) {
        const src = zMin[b - d] !== undefined && zMin[b - d] !== Infinity ? b - d
          : zMin[b + d] !== undefined && zMin[b + d] !== Infinity ? b + d : -1;
        if (src !== -1) {
          hw[b] = hw[src];
          zMin[b] = zMin[src];
          zMax[b] = zMax[src];
          break;
        }
      }
    }
    return {
      hwAt: (y) => hw[Math.max(0, Math.min(BIN_COUNT - 1, Math.floor(((y - yMin) / span) * BIN_COUNT)))],
      midZAt: (y) => {
        const b = Math.max(0, Math.min(BIN_COUNT - 1, Math.floor(((y - yMin) / span) * BIN_COUNT)));
        return (zMin[b] + zMax[b]) / 2;
      },
    };
  }
  const segIdxOf = (name) => segNames.indexOf(name);
  const stats = {
    torso: sliceStats([segIdxOf("torso")]),
    head: sliceStats([segIdxOf("head")]),
    neck: sliceStats([segIdxOf("neck")]),
  };

  /* ---- limb parameters (joint-anchored t + face quadrant) ---- */
  const LIMB_ANCHORS = { arm: [0, 0.45, 0.85, 1], leg: [0, 0.5, 0.9, 1] };
  const limbT = new Float32Array(n).fill(-1);
  const limbFace = new Array(n).fill(null);
  for (let v = 0; v < n; v++) {
    const segName = segNames[segments[v]];
    if (!segName.startsWith("arm") && !segName.startsWith("leg")) continue;
    const kind = segName.startsWith("arm") ? "arm" : "leg";
    const side = segName.endsWith("L") ? "left" : "right";
    const structure = structures[segName];
    const p = P(v);
    let bestBone = 0, bestS = 0, bestDist = Infinity, bestPoint = p;
    structure.bones.forEach((bone, k) => {
      const { s, dist, point } = closestOnSegment(p, bone.p0, bone.p1);
      if (dist < bestDist) {
        bestDist = dist;
        bestBone = k;
        bestS = s;
        bestPoint = point;
      }
    });
    const A = LIMB_ANCHORS[kind];
    limbT[v] = A[bestBone] + (A[bestBone + 1] - A[bestBone]) * bestS;
    // face quadrant: front = +z projected off the bone axis; inner = toward
    // the body midline (sign normalized per side)
    const bone = structure.bones[bestBone];
    const axis = norm(sub(bone.p1, bone.p0));
    const zProj = sub([0, 0, 1], scale3(axis, axis[2]));
    const fwd = norm(zProj);
    const medial = side === "left" ? [-1, 0, 0] : [1, 0, 0];
    const medProj = norm(sub(medial, scale3(axis, dot(medial, axis))));
    const off = sub(p, bestPoint);
    const f = dot(off, fwd);
    const i = dot(off, medProj);
    limbFace[v] =
      Math.abs(f) >= Math.abs(i)
        ? f >= 0 ? "front" : "back"
        : i >= 0 ? "inner" : "outer";
  }

  // foot z-fraction per leg side (t >= 0.93)
  const footZ = { left: [Infinity, -Infinity], right: [Infinity, -Infinity] };
  for (let v = 0; v < n; v++) {
    const segName = segNames[segments[v]];
    if (!segName.startsWith("leg") || limbT[v] < 0.93) continue;
    const side = segName.endsWith("L") ? "left" : "right";
    const z = positions[v * 3 + 2];
    footZ[side][0] = Math.min(footZ[side][0], z);
    footZ[side][1] = Math.max(footZ[side][1], z);
  }

  /* ---- stage 2: rule evaluation ---- */
  const Y_ANCHORS = {
    torso: [lm.crotchY, lm.shoulder.y],
    neck: [lm.shoulder.y, lm.chinY],
    head: [lm.chinY, H],
  };
  const labels = new Uint16Array(n).fill(0xffff);
  const inRange = (value, range) => value >= range[0] && value <= range[1];

  for (let v = 0; v < n; v++) {
    const segName = segNames[segments[v]];
    const isLimb = segName.startsWith("arm") || segName.startsWith("leg");
    const ruleKind = isLimb ? (segName.startsWith("arm") ? "arm" : "leg") : segName;
    const rules = SEGMENT_RULES[ruleKind];
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const side = isLimb ? (segName.endsWith("L") ? "left" : "right") : x >= 0 ? "left" : "right";

    let yNorm = 0, axNorm = 0, zFace = "front";
    if (!isLimb) {
      const [lo, hi] = Y_ANCHORS[ruleKind];
      yNorm = (y - lo) / Math.max(1e-6, hi - lo);
      const hw = stats[ruleKind].hwAt(y);
      axNorm = hw > 1e-4 ? Math.abs(x) / hw : 0;
      zFace = z >= stats[ruleKind].midZAt(y) ? "front" : "back";
    }
    let zSeg = 0;
    if (segName.startsWith("leg") && limbT[v] >= 0.93) {
      const [zLo, zHi] = footZ[side];
      zSeg = (z - zLo) / Math.max(1e-6, zHi - zLo);
    }
    const nY = normals[v * 3 + 1];

    for (const rule of rules) {
      if (rule.variants && !rule.variants.includes(variant)) continue;
      if (rule.y && !inRange(yNorm, rule.y)) continue;
      if (rule.z && rule.z !== zFace) continue;
      if (rule.ax && !inRange(axNorm, rule.ax)) continue;
      if (rule.t && !inRange(limbT[v], rule.t)) continue;
      if (rule.face && !rule.face.includes(limbFace[v])) continue;
      if (rule.zSeg && !inRange(zSeg, rule.zSeg)) continue;
      if (rule.nY && !inRange(nY, rule.nY)) continue;
      const id = rule.id.replace("{S}", side);
      const idx = REGION_INDEX.get(id);
      assert(idx !== undefined, `${variant}: rule resolves to unknown id "${id}"`);
      labels[v] = idx;
      break;
    }
    assert(
      labels[v] !== 0xffff,
      `${variant}: vertex ${v} (${segName}) unlabeled — segment rules must end in a catch-all`,
    );
  }

  /* ---- invariants ---- */
  const counts = new Map();
  for (let v = 0; v < n; v++) {
    const id = REGION_IDS[labels[v]];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const applicable = REGION_IDS.filter(
    (id) => !REGION_VARIANTS[id] || REGION_VARIANTS[id].includes(variant),
  );
  const problems = [];
  for (const id of applicable) {
    const c = counts.get(id) ?? 0;
    if (c < MIN_VERTS) problems.push(`${id}: ${c} verts (< ${MIN_VERTS})`);
  }
  for (const id of REGION_IDS) {
    if (!applicable.includes(id) && (counts.get(id) ?? 0) > 0) {
      problems.push(`${id}: present on ${variant} but variant-gated off`);
    }
  }
  for (const id of applicable) {
    if (!id.endsWith(".left")) continue;
    const twin = id.replace(/\.left$/, ".right");
    const cl = counts.get(id) ?? 0;
    const cr = counts.get(twin) ?? 0;
    const diff = Math.abs(cl - cr) / Math.max(cl, cr, 1);
    if (diff > SYMMETRY_TOLERANCE) {
      problems.push(`${id}/${twin}: asymmetric ${cl} vs ${cr} (${(diff * 100).toFixed(0)}%)`);
    }
  }
  if (problems.length) {
    for (const p of problems) console.error(`  INVARIANT: ${p}`);
    // diagnostics: where did the vertices actually go?
    const segCounts = segNames.map(
      (name, s) => `${name}:${segments.reduce((a, x) => a + (x === s ? 1 : 0), 0)}`,
    );
    console.error(`  segments: ${segCounts.join(" ")}`);
    for (const limb of ["armL", "armR", "legL", "legR"]) {
      const s = segNames.indexOf(limb);
      const ts = [];
      for (let v = 0; v < n; v++) if (segments[v] === s) ts.push(limbT[v]);
      if (ts.length) {
        ts.sort((a, b) => a - b);
        console.error(
          `  ${limb}: t range ${ts[0].toFixed(2)}..${ts[ts.length - 1].toFixed(2)}, ` +
            `>=0.85: ${ts.filter((t) => t >= 0.85).length}`,
        );
      }
    }
    assert(false, `${variant}: ${problems.length} label invariant(s) failed`);
  }

  /* ---- region adjacency (shared mesh edges >= threshold) ---- */
  const edgeCounts = new Map();
  for (let v = 0; v < n; v++) {
    for (const w of neighbors[v]) {
      if (w <= v || labels[v] === labels[w]) continue;
      const key = labels[v] < labels[w] ? `${labels[v]}|${labels[w]}` : `${labels[w]}|${labels[v]}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  const adjacency = new Map(applicable.map((id) => [id, new Set()]));
  for (const [key, count] of edgeCounts) {
    if (count < ADJACENCY_MIN_EDGES) continue;
    const [a, b] = key.split("|").map((k) => REGION_IDS[+k]);
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }
  for (const [a, b] of ADJACENCY_OVERRIDES.add) {
    if (adjacency.has(a) && adjacency.has(b)) {
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }
  }
  for (const [a, b] of ADJACENCY_OVERRIDES.remove) {
    adjacency.get(a)?.delete(b);
    adjacency.get(b)?.delete(a);
  }

  /* ---- manifest: anchors, AABBs ----
   * Anchor = the region's most INTERIOR vertex (max BFS depth from the
   * label boundary), tie-broken by distance to centroid. Centroid-nearest
   * vertices land on the boundary of thin zones and make terrible pin
   * anchors and probe targets. The anchor's vertex normal ships too, so
   * consumers can approach the zone face-on. */
  const boundaryDepth = new Int32Array(n).fill(-1);
  {
    const queue = [];
    for (let v = 0; v < n; v++) {
      for (const w of neighbors[v]) {
        if (labels[w] !== labels[v]) {
          boundaryDepth[v] = 0;
          queue.push(v);
          break;
        }
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      for (const w of neighbors[u]) {
        if (labels[w] === labels[u] && boundaryDepth[w] === -1) {
          boundaryDepth[w] = boundaryDepth[u] + 1;
          queue.push(w);
        }
      }
    }
  }
  const regionsOut = {};
  for (const id of applicable) {
    const idx = REGION_INDEX.get(id);
    let cx = 0, cy = 0, cz = 0, c = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < n; v++) {
      if (labels[v] !== idx) continue;
      const p = P(v);
      cx += p[0]; cy += p[1]; cz += p[2]; c++;
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[a]);
        max[a] = Math.max(max[a], p[a]);
      }
    }
    const centroid = [cx / c, cy / c, cz / c];
    // interiority as a FLOOR (>= 2 edges off the boundary when possible),
    // centrality as the chooser — maximal depth alone finds fold bottoms
    // (under-chin creases, skull curves) with useless outward normals
    let maxDepth = 0;
    for (let v = 0; v < n; v++) {
      if (labels[v] !== idx) continue;
      const depth = boundaryDepth[v] === -1 ? 1e6 : boundaryDepth[v];
      if (depth > maxDepth) maxDepth = depth;
    }
    const depthFloor = Math.min(2, maxDepth);
    let anchorV = -1;
    let bestD = Infinity;
    for (let v = 0; v < n; v++) {
      if (labels[v] !== idx) continue;
      const depth = boundaryDepth[v] === -1 ? 1e6 : boundaryDepth[v];
      if (depth < depthFloor) continue;
      const d = len(sub(P(v), centroid));
      if (d < bestD) {
        bestD = d;
        anchorV = v;
      }
    }
    regionsOut[id] = {
      count: c,
      anchor: P(anchorV).map((x) => +x.toFixed(4)),
      anchorNormal: [
        +normals[anchorV * 3].toFixed(4),
        +normals[anchorV * 3 + 1].toFixed(4),
        +normals[anchorV * 3 + 2].toFixed(4),
      ],
      aabb: {
        min: min.map((x) => +x.toFixed(4)),
        max: max.map((x) => +x.toFixed(4)),
      },
    };
  }

  /* ---- inject _REGION into the GLB ---- */
  const glbOut = injectRegionAttribute(json, bin, prim, labels);
  const destPath = path.join(assetsDir, `${variant}.glb`);
  writeFileSync(destPath, glbOut);
  const glbHash = createHash("sha256").update(glbOut).digest("hex").slice(0, 12);

  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    variant,
    glbHash,
    vertexCount: n,
    fit: lm.fit,
    regions: regionsOut,
    adjacency: Object.fromEntries(
      [...adjacency.entries()].map(([id, set]) => [id, [...set].sort()]),
    ),
  };
  writeFileSync(
    path.join(manifestDir, `${variant}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(
    `${variant}: labeled ${n} verts across ${applicable.length} regions ` +
      `(min count ${Math.min(...applicable.map((id) => counts.get(id) ?? 0))}), glb ${glbHash}`,
  );
  return glbHash;
}

/** Append a Uint16 SCALAR accessor and reference it as _REGION. */
function injectRegionAttribute(json, bin, prim, labels) {
  const out = structuredClone(json);
  const outPrim = out.meshes[0].primitives[0];
  assert(
    outPrim.attributes._REGION === undefined,
    "source glb already carries _REGION — bake must read pristine exports",
  );
  const pad4 = (nBytes) => (4 - (nBytes % 4)) % 4;
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad4(bin.length))]);
  const labelBytes = Buffer.from(labels.buffer, labels.byteOffset, labels.byteLength);
  const newBin = Buffer.concat([
    binPadded,
    labelBytes,
    Buffer.alloc(pad4(labelBytes.length)),
  ]);
  out.bufferViews.push({
    buffer: 0,
    byteOffset: binPadded.length,
    byteLength: labelBytes.length,
  });
  out.accessors.push({
    bufferView: out.bufferViews.length - 1,
    componentType: 5123, // UNSIGNED_SHORT
    count: labels.length,
    type: "SCALAR",
  });
  outPrim.attributes._REGION = out.accessors.length - 1;
  out.buffers[0].byteLength = newBin.length;

  let jsonBuf = Buffer.from(JSON.stringify(out), "utf8");
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const total = 12 + 8 + jsonBuf.length + 8 + newBin.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonBuf.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(glb, 20);
  const binHeader = 20 + jsonBuf.length;
  glb.writeUInt32LE(newBin.length, binHeader);
  glb.writeUInt32LE(0x004e4942, binHeader + 4);
  newBin.copy(glb, binHeader + 8);
  return glb;
}

const hashes = {};
for (const variant of ["body-a", "body-b"]) {
  hashes[`${variant}.glb`] = bake(variant);
}
writeFileSync(
  path.join(scriptsDir, "..", "src", "data", "asset-manifest.json"),
  JSON.stringify(hashes, null, 2) + "\n",
);
console.log("bake complete; asset manifest updated");
