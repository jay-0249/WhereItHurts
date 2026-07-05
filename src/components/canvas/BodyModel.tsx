"use client";

import { useEffect, useMemo, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Outlines, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { REGION_IDS, type RegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { FIGURE } from "./placeholder-figure";

/**
 * Raycast layer reserved for selectable region meshes. Scene.tsx restricts
 * the event raycaster to this layer, so the floor, stage, and any helper
 * objects can never be selected or highlighted — only region meshes are
 * eligible hits.
 */
export const REGION_RAYCAST_LAYER = 1;

const GLOW_TARGET = 0.55;
const GLOW_FADE_SECONDS = 0.2; // glow fades in over 200ms (DESIGN.md §4)
const TAP_SLOP_PX = 5; // pointer moved further than this = rotate, not tap

export function BodyModel() {
  const pending = useSession((s) => s.pending);
  const selectRegion = useSession((s) => s.selectRegion);
  const [hovered, setHovered] = useState<RegionId | null>(null);
  useCursor(hovered !== null);

  const geometries = useMemo(() => {
    const map = new Map<RegionId, THREE.BufferGeometry>();
    for (const id of REGION_IDS) {
      const spec = FIGURE[id];
      map.set(
        id,
        spec.kind === "capsule"
          ? new THREE.CapsuleGeometry(spec.radius, spec.length ?? 0, 8, 24)
          : new THREE.SphereGeometry(spec.radius, 32, 24),
      );
    }
    return map;
  }, []);

  // One skin material shared by all unselected regions (CLAUDE.md: share
  // materials, useMemo).
  const skinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#C9B8A8", roughness: 0.85 }),
    [],
  );

  // The ember glow lives on a material instance cloned per selection and
  // assigned only to the selected region's mesh — never mutate a material
  // that other meshes reference.
  const selectedRegionId = pending?.regionId ?? null;
  const selectedMaterial = useMemo(() => {
    if (!selectedRegionId) return null;
    const m = skinMaterial.clone();
    m.emissive = new THREE.Color("#E4572E");
    m.emissiveIntensity = 0;
    return m;
  }, [selectedRegionId, skinMaterial]);

  useEffect(() => () => selectedMaterial?.dispose(), [selectedMaterial]);

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
      skinMaterial.dispose();
    };
  }, [geometries, skinMaterial]);

  // Glow animates by mutating the cloned material in useFrame — never
  // setState per frame (CLAUDE.md performance rules). Each selection starts
  // from a fresh instance at intensity 0, so the fade always restarts.
  useFrame((_, delta) => {
    if (!selectedMaterial) return;
    selectedMaterial.emissiveIntensity = Math.min(
      GLOW_TARGET,
      selectedMaterial.emissiveIntensity +
        (delta / GLOW_FADE_SECONDS) * GLOW_TARGET,
    );
  });

  const handleTap = (id: RegionId) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > TAP_SLOP_PX) return;
    event.stopPropagation();
    navigator.vibrate?.(10);
    selectRegion(id);
  };

  return (
    <group>
      {REGION_IDS.map((id) => {
        const spec = FIGURE[id];
        const isSelected = selectedRegionId === id;
        return (
          <mesh
            key={id}
            ref={(mesh) => mesh?.layers.enable(REGION_RAYCAST_LAYER)}
            geometry={geometries.get(id)}
            material={
              isSelected && selectedMaterial ? selectedMaterial : skinMaterial
            }
            position={spec.position as [number, number, number]}
            scale={spec.scale ? (spec.scale as [number, number, number]) : 1}
            onClick={handleTap(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(id);
            }}
            onPointerOut={() => setHovered((h) => (h === id ? null : h))}
          >
            {/* Hover: outline only. Selected: outline + ember glow (DESIGN.md
                §1). World-space thickness — screenspace mode misrenders on
                non-uniformly scaled meshes. */}
            {(isSelected || hovered === id) && (
              <Outlines thickness={0.02} color="#E4572E" />
            )}
          </mesh>
        );
      })}
    </group>
  );
}
