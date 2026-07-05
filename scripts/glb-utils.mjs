/**
 * Dependency-free GLB reading + body measurement helpers, shared by
 * verify-bodies.mjs and measure-body.mjs.
 */
import { readFileSync } from "node:fs";
import {
  applyFitToPositions,
  computeFitFromBounds,
  VISUAL_TARGET_HEIGHT,
} from "../src/lib/body-fit.mjs";

export function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

/** Parse a .glb into { json, bin } (bin as Buffer, may be undefined). */
export function parseGlb(filePath) {
  const buf = readFileSync(filePath);
  assert(buf.readUInt32LE(0) === 0x46546c67, `${filePath}: glTF magic`);
  assert(buf.readUInt32LE(4) === 2, `${filePath}: glTF version 2`);
  const jsonLength = buf.readUInt32LE(12);
  assert(buf.readUInt32LE(16) === 0x4e4f534a, `${filePath}: JSON chunk`);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  let bin;
  const binHeader = 20 + jsonLength;
  if (binHeader + 8 <= buf.length) {
    const binLength = buf.readUInt32LE(binHeader);
    assert(buf.readUInt32LE(binHeader + 4) === 0x004e4942, "BIN chunk");
    bin = buf.subarray(binHeader + 8, binHeader + 8 + binLength);
  }
  return { json, bin, raw: buf };
}

/** Read a VEC3 FLOAT accessor into a flat Float32Array [x,y,z,...]. */
export function readVec3Accessor(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  assert(accessor.componentType === 5126, "accessor is FLOAT");
  assert(accessor.type === "VEC3", "accessor is VEC3");
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 12;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i++) {
    const offset = base + i * stride;
    out[i * 3] = bin.readFloatLE(offset);
    out[i * 3 + 1] = bin.readFloatLE(offset + 4);
    out[i * 3 + 2] = bin.readFloatLE(offset + 8);
  }
  return out;
}

/** All POSITION data of all mesh primitives, concatenated. */
export function readPositions(json, bin) {
  const arrays = [];
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      arrays.push(readVec3Accessor(json, bin, prim.attributes.POSITION));
    }
  }
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let cursor = 0;
  for (const a of arrays) {
    out.set(a, cursor);
    cursor += a.length;
  }
  return out;
}

export const TARGET_HEIGHT = VISUAL_TARGET_HEIGHT;

/**
 * The raw-accessor read is only frame-equivalent to the app's
 * Box3.setFromObject if the glb nodes carry no transforms. Fail loudly if
 * a future export changes that.
 */
export function assertIdentityNodes(json, label = "glb") {
  for (const node of json.nodes ?? []) {
    assert(
      !node.translation && !node.rotation && !node.scale && !node.matrix,
      `${label}: node "${node.name}" carries a transform — raw accessor reads no longer match the app's scene-graph bbox`,
    );
  }
}

/**
 * Apply the app's auto-fit (shared src/lib/body-fit.mjs) in place.
 * Returns { positions, fit } so callers can record/compare the transform.
 */
export function autoFit(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], positions[i + a]);
      max[a] = Math.max(max[a], positions[i + a]);
    }
  }
  const fit = computeFitFromBounds(min, max);
  applyFitToPositions(positions, fit);
  return { positions, fit };
}

/** Read a mesh primitive's index accessor as a typed array. */
export function readIndices(json, bin, prim) {
  assert(prim.indices !== undefined, "primitive is indexed");
  const accessor = json.accessors[prim.indices];
  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const Ctor =
    accessor.componentType === 5125
      ? Uint32Array
      : accessor.componentType === 5123
        ? Uint16Array
        : null;
  assert(Ctor, `index componentType ${accessor.componentType} supported`);
  const out = new Ctor(accessor.count);
  const bytes = Ctor.BYTES_PER_ELEMENT;
  for (let i = 0; i < accessor.count; i++) {
    out[i] = bytes === 4 ? bin.readUInt32LE(base + i * 4) : bin.readUInt16LE(base + i * 2);
  }
  return out;
}

/**
 * Width of the cluster of x-values containing x=0 within a y band —
 * i.e. the torso, excluding arm/hand clusters separated by an x gap.
 * Returns { halfWidth } or null if the band is empty.
 */
export function torsoClusterHalfWidth(positions, yLo, yHi, gap = 0.06) {
  const xs = [];
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    if (y >= yLo && y <= yHi) xs.push(positions[i]);
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  // start from the value closest to 0 and expand while gaps stay small
  let start = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i]) < Math.abs(xs[start])) start = i;
  }
  let lo = start;
  let hi = start;
  while (lo > 0 && xs[lo] - xs[lo - 1] < gap) lo--;
  while (hi < xs.length - 1 && xs[hi + 1] - xs[hi] < gap) hi++;
  return { halfWidth: Math.max(Math.abs(xs[lo]), Math.abs(xs[hi])) };
}
