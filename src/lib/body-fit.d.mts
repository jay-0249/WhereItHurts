/** Type declarations for body-fit.mjs (shared app/scripts). */

export declare const VISUAL_TARGET_HEIGHT: number;

export interface BodyFit {
  scale: number;
  /** [cx, minY, cz]; number[] so JSON-loaded fits assign directly */
  center: number[];
}

export declare function computeFitFromBounds(
  min: ArrayLike<number>,
  max: ArrayLike<number>,
): BodyFit;

export declare function applyFitToPositions(
  positions: Float32Array,
  fit: BodyFit,
): Float32Array;

export declare function fitsMatch(a: BodyFit, b: BodyFit, tolerance?: number): boolean;
