"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Preload, StatsGl } from "@react-three/drei";
import { en } from "@/i18n/en";
import { BodyModel, REGION_RAYCAST_LAYER } from "./BodyModel";
import { BodyVisual } from "./BodyVisual";
import { Pins } from "./Pins";

const CAMERA_DISTANCE = 4.6;
// Vertical orbit clamped to ±30° from horizontal (DESIGN.md §3.2)
const POLAR_CLAMP = Math.PI / 6;

export function Scene() {
  return (
    <Canvas
      // devicePixelRatio clamped to max 2 (CLAUDE.md performance rules)
      dpr={[1, 2]}
      camera={{ position: [0, 1.8, CAMERA_DISTANCE], fov: 45 }}
      aria-label={en.canvas.canvasLabel}
      role="img"
      // Tap raycasts hit ONLY region meshes (they opt into this layer);
      // floor, stage, and helpers are never selectable.
      onCreated={({ raycaster }) => raycaster.layers.set(REGION_RAYCAST_LAYER)}
    >
      {/* DESIGN.md §1: key upper-left 1.1, fill right 0.4, gentle hemisphere */}
      <directionalLight position={[-3, 5, 3]} intensity={1.1} />
      <directionalLight position={[3, 2, 1]} intensity={0.4} />
      <hemisphereLight intensity={0.5} groundColor="#E3E8E6" />

      <Suspense fallback={null}>
        <BodyVisual />
      </Suspense>
      <BodyModel />
      <Pins />

      {/* Soft floor shadow disc under the figure — ink at 8%. raycast
          disabled: stage dressing must never intercept taps. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        raycast={() => null}
      >
        <circleGeometry args={[0.95, 48]} />
        <meshBasicMaterial color="#182430" transparent opacity={0.08} />
      </mesh>

      <OrbitControls
        target={[0, 1.8, 0]}
        enablePan={false}
        minPolarAngle={Math.PI / 2 - POLAR_CLAMP}
        maxPolarAngle={Math.PI / 2 + POLAR_CLAMP}
        // Zoom clamped 0.8x–3x of the resting distance (DESIGN.md §3.2)
        minDistance={CAMERA_DISTANCE / 3}
        maxDistance={CAMERA_DISTANCE / 0.8}
      />

      <Preload all />
      {/* r3f-perf is incompatible with Turbopack dev (see CLAUDE.md); StatsGl
          is the interim dev perf monitor */}
      {process.env.NODE_ENV === "development" && <StatsGl className="statsgl" />}
    </Canvas>
  );
}
