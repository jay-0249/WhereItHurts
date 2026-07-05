/**
 * Verifies the generated body GLBs and installs them into public/assets/.
 * Run from the project root after scripts/generate-bodies.py:
 *
 *     node scripts/verify-bodies.mjs
 *
 * Per-file checks: 1 mesh, triangle budget, normals, no skins/animations,
 * Y-up humanlike proportions. Cross-file HARD CHECK: the two variants must
 * not be byte-identical and their shoulder:hip width ratios must differ by
 * at least 8% — alignment must never run against effectively equal bodies.
 */
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assert,
  autoFit,
  parseGlb,
  readPositions,
  torsoClusterHalfWidth,
  TARGET_HEIGHT,
} from "./glb-utils.mjs";

const TRI_MIN = 10_000;
const TRI_MAX = 20_000;
// Height:width sanity for a standing human. The bbox includes arms, which
// hang at 12 deg (the landmark measurement needs an x-gap between arm and
// torso), so real exports measure ~2.5-3.4:1. The floor exists to catch a
// T-pose or garbage export (~1.2-1.5), not to police posture — precise
// proportion checks live in measure-body.mjs's landmark asserts.
const RATIO_MIN = 2.4;
const RATIO_MAX = 5.0;
const MIN_VARIANT_RATIO_DIFF = 0.08;

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptsDir, "out");
const assetsDir = path.join(scriptsDir, "..", "public", "assets");

function triangleCount(gltf) {
  let triangles = 0;
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      assert((prim.mode ?? 4) === 4, "primitive mode is TRIANGLES");
      const accessor =
        prim.indices !== undefined
          ? gltf.accessors[prim.indices]
          : gltf.accessors[prim.attributes.POSITION];
      triangles += accessor.count / 3;
    }
  }
  return triangles;
}

function verify(name) {
  const filePath = path.join(outDir, `${name}.glb`);
  const { json: gltf, bin } = parseGlb(filePath);

  assert(gltf.meshes?.length === 1, `${name}: exactly 1 mesh`);
  assert(!gltf.skins?.length, `${name}: no skins`);
  assert(!gltf.animations?.length, `${name}: no animations`);
  for (const prim of gltf.meshes[0].primitives) {
    assert(prim.attributes.NORMAL !== undefined, `${name}: normals present`);
  }

  const tris = triangleCount(gltf);
  assert(
    tris >= TRI_MIN && tris <= TRI_MAX,
    `${name}: triangles ${tris} within ${TRI_MIN}-${TRI_MAX}`,
  );

  const pos = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const dims = pos.max.map((m, i) => m - pos.min[i]);
  const [width, height, depth] = dims;
  assert(
    height >= width && height >= depth,
    `${name}: height (Y) is the largest axis`,
  );
  const ratio = height / width;
  assert(
    ratio >= RATIO_MIN && ratio <= RATIO_MAX,
    `${name}: height:width ${ratio.toFixed(2)} within ${RATIO_MIN}-${RATIO_MAX}`,
  );

  // shoulder & hip widths from y-band torso clusters (app-space transform)
  const { positions } = autoFit(readPositions(gltf, bin));
  const H = TARGET_HEIGHT;
  const shoulder = torsoClusterHalfWidth(positions, 0.72 * H, 0.8 * H);
  const hip = torsoClusterHalfWidth(positions, 0.46 * H, 0.54 * H);
  assert(shoulder && hip, `${name}: shoulder/hip bands non-empty`);
  const shoulderHipRatio = shoulder.halfWidth / hip.halfWidth;

  console.log(
    `${name}: OK — ${tris} tris, bbox ${dims.map((d) => d.toFixed(3)).join(" x ")}, ` +
      `h:w ${ratio.toFixed(2)}, shoulder:hip ${shoulderHipRatio.toFixed(3)} ` +
      `(shoulder ${shoulder.halfWidth.toFixed(3)}, hip ${hip.halfWidth.toFixed(3)})`,
  );
  return { filePath, shoulderHipRatio };
}

const results = {};
for (const name of ["body-a", "body-b"]) {
  results[name] = verify(name);
}

// HARD CHECK: variants must actually differ
const bytesA = readFileSync(results["body-a"].filePath);
const bytesB = readFileSync(results["body-b"].filePath);
assert(!bytesA.equals(bytesB), "body-a and body-b must not be byte-identical");
const ratioDiff =
  Math.abs(results["body-a"].shoulderHipRatio - results["body-b"].shoulderHipRatio) /
  Math.min(results["body-a"].shoulderHipRatio, results["body-b"].shoulderHipRatio);
assert(
  ratioDiff >= MIN_VARIANT_RATIO_DIFF,
  `variant shoulder:hip ratios must differ by >= ${MIN_VARIANT_RATIO_DIFF * 100}% (got ${(ratioDiff * 100).toFixed(1)}%)`,
);
console.log(`variant difference: shoulder:hip ratios differ by ${(ratioDiff * 100).toFixed(1)}%`);

const manifest = {};
for (const name of ["body-a", "body-b"]) {
  const dest = path.join(assetsDir, `${name}.glb`);
  copyFileSync(results[name].filePath, dest);
  // content hash for cache-busting: the app requests body-a.glb?v=<hash>,
  // so a regenerated mesh can never be served stale from a browser cache
  manifest[`${name}.glb`] = createHash("sha256")
    .update(readFileSync(dest))
    .digest("hex")
    .slice(0, 12);
  console.log(`installed ${dest} (v=${manifest[`${name}.glb`]})`);
}
writeFileSync(
  path.join(scriptsDir, "..", "src", "data", "asset-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("all bodies verified and installed; asset manifest written");
