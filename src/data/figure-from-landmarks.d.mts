/** Type declarations for figure-from-landmarks.mjs (shared app/scripts). */

export interface LandmarkSlice {
  y: number;
  halfWidth: number;
  zMin: number;
  zMax: number;
}

export interface BodyLandmarks {
  variant: string;
  height: number;
  fit: { scale: number; center: number[] };
  armpitY: number;
  shoulder: { y: number; halfWidth: number };
  crotchY: number;
  chestBotY: number;
  waist: { y: number; halfWidth: number };
  hip: { y: number; halfWidth: number };
  torsoSlices: {
    chest: LandmarkSlice;
    waist: LandmarkSlice;
    hip: LandmarkSlice;
    pelvis: LandmarkSlice;
  };
  bust: { y: number; zMax: number; x: number };
  neck: { y: number; halfWidth: number; zMin: number; zMax: number };
  chinY: number;
  head: { halfWidth: number; zMin: number; zMax: number };
  arm: {
    wristY: number;
    wristRadius: number;
    handBottomY: number;
    radius: number;
    upperAngleDeg: number;
    foreAngleDeg: number;
    top: number[];
    elbow: number[];
    wrist: number[];
    hand: { cz: number; zHalf: number };
  };
  leg: {
    topX: number;
    topZ: number;
    thigh: { y: number; x: number; z: number; radius: number };
    knee: { y: number; x: number; z: number; radius: number };
    calf: { y: number; x: number; radius: number; zMin: number; zMax: number };
    ankle: { y: number; x: number; z: number; radius: number };
  };
  foot: {
    centerX: number;
    halfWidth: number;
    zMin: number;
    zMax: number;
    topY: number;
  };
}

export interface LandmarkFigureSpec {
  kind: "sphere" | "capsule";
  position: [number, number, number];
  radius: number;
  length?: number;
  scale?: [number, number, number];
  rotation?: [number, number, number];
}

export declare function buildFigureFromLandmarks(
  landmarks: BodyLandmarks,
): Record<string, LandmarkFigureSpec>;
