"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Outlines, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { REGION_IDS, type RegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { FIGURE } from "./placeholder-figure";

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

  // Skin material shared across all regions; one extra instance for the
  // selected region's ember glow (CLAUDE.md: share materials, useMemo).
  const skinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#C9B8A8", roughness: 0.85 }),
    [],
  );
  const selectedMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#C9B8A8",
        roughness: 0.85,
        emissive: new THREE.Color("#E4572E"),
        emissiveIntensity: 0,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
      skinMaterial.dispose();
      selectedMaterial.dispose();
    };
  }, [geometries, skinMaterial, selectedMaterial]);

  // Glow animates by mutating the material in useFrame — never setState
  // per frame (CLAUDE.md performance rules).
  const lastSelectedRef = useRef<RegionId | null>(null);
  useFrame((_, delta) => {
    const selected = pending?.regionId ?? null;
    if (selected !== lastSelectedRef.current) {
      selectedMaterial.emissiveIntensity = 0;
      lastSelectedRef.current = selected;
    }
    if (selected) {
      selectedMaterial.emissiveIntensity = Math.min(
        GLOW_TARGET,
        selectedMaterial.emissiveIntensity +
          (delta / GLOW_FADE_SECONDS) * GLOW_TARGET,
      );
    }
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
        const isSelected = pending?.regionId === id;
        return (
          <mesh
            key={id}
            geometry={geometries.get(id)}
            material={isSelected ? selectedMaterial : skinMaterial}
            position={spec.position as [number, number, number]}
            scale={spec.scale ? (spec.scale as [number, number, number]) : 1}
            onClick={handleTap(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(id);
            }}
            onPointerOut={() =>
              setHovered((h) => (h === id ? null : h))
            }
          >
            {(isSelected || hovered === id) && (
              <Outlines screenspace thickness={1.5} color="#E4572E" />
            )}
          </mesh>
        );
      })}
    </group>
  );
}
