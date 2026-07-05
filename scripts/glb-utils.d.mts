/** Type declarations for glb-utils.mjs (consumed by the test suites). */
import type { BodyFit } from "../src/lib/body-fit.mjs";

export declare const TARGET_HEIGHT: number;

export declare function assert(condition: unknown, message: string): asserts condition;

export declare function parseGlb(filePath: string): {
  json: any;
  bin: Buffer;
  raw: Buffer;
};

export declare function assertIdentityNodes(json: any, label?: string): void;

export declare function readVec3Accessor(
  json: any,
  bin: Buffer,
  accessorIndex: number,
): Float32Array;

export declare function readPositions(json: any, bin: Buffer): Float32Array;

export declare function readIndices(
  json: any,
  bin: Buffer,
  prim: any,
): Uint16Array | Uint32Array;

export declare function autoFit(positions: Float32Array): {
  positions: Float32Array;
  fit: BodyFit;
};

export declare function torsoClusterHalfWidth(
  positions: Float32Array,
  yLo: number,
  yHi: number,
  gap?: number,
): { halfWidth: number } | null;
