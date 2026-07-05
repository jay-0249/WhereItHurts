/**
 * Dependency-free GLB reading + body measurement helpers, shared by
 * verify-bodies.mjs and measure-body.mjs.
 */
import { readFileSync } from "node:fs";

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

export const TARGET_HEIGHT = 3.6; // must match VISUAL_TARGET_HEIGHT in the app

/**
 * Apply the app's auto-fit transform in place: uniform-scale to
 * TARGET_HEIGHT tall, feet at y=0, centered on x/z. Returns the positions.
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
  const scale = TARGET_HEIGHT / (max[1] - min[1]);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - min[1]) * scale;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
  }
  return positions;
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
