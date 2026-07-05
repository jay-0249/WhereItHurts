"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Outlines, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { regionsForVariant, type RegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { FIGURE } from "./placeholder-figure";
import { resolveProxy, type ResolvedProxy } from "./body-variants";

/**
 * Raycast layer reserved for selectable region proxies. Scene.tsx restricts
 * the event raycaster to this layer, so the visual body, floor, stage, and
 * any helper objects can never be selected or highlighted — only proxies
 * are eligible hits.
 */
export const REGION_RAYCAST_LAYER = 1;

const EMBER = "#E4572E";
// Translucent ember wash over the visual mesh (DESIGN.md: mild = 35%)
const OVERLAY_OPACITY = 0.35;
const OVERLAY_FADE_SECONDS = 0.2; // fades in over 200ms (DESIGN.md §4)
// Inflation along vertex normals in world units, applied after baking the
// proxy's (possibly non-uniform) scale into the geometry — NOT mesh scaling,
// which distorts non-uniformly scaled proxies.
const OVERLAY_INFLATE = 0.012;
const TAP_SLOP_PX = 5; // pointer moved further than this = rotate, not tap

function buildProxyGeometry(id: RegionId): THREE.BufferGeometry {
  const spec = FIGURE[id];
  return spec.kind === "capsule"
    ? new THREE.CapsuleGeometry(spec.radius, spec.length ?? 0, 8, 24)
    : new THREE.SphereGeometry(spec.radius, 32, 24);
}

/**
 * The invisible interaction layer: one raycastable proxy volume per region.
 * Proxies stay rendered (visible=false can drop meshes out of raycasting)
 * but draw nothing: opacity 0, no color write, no depth write.
 */
export function BodyModel() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const pending = useSession((s) => s.pending);
  const selectRegion = useSession((s) => s.selectRegion);
  const [hovered, setHovered] = useState<RegionId | null>(null);
  useCursor(hovered !== null);

  const regionIds = useMemo(() => regionsForVariant(variant), [variant]);

  const geometries = useMemo(() => {
    const map = new Map<RegionId, THREE.BufferGeometry>();
    for (const id of regionIds) map.set(id, buildProxyGeometry(id));
    return map;
  }, [regionIds]);

  const transforms = useMemo(() => {
    const map = new Map<RegionId, ResolvedProxy>();
    for (const id of regionIds) map.set(id, resolveProxy(variant, id));
    return map;
  }, [variant, regionIds]);

  const proxyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false,
      }),
    [],
  );

  const overlayMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: EMBER,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
    };
  }, [geometries]);

  useEffect(() => {
    return () => {
      proxyMaterial.dispose();
      overlayMaterial.dispose();
    };
  }, [proxyMaterial, overlayMaterial]);

  const selectedRegionId =
    pending && regionIds.includes(pending.regionId) ? pending.regionId : null;
  const selectedTransform = selectedRegionId
    ? transforms.get(selectedRegionId)
    : undefined;

  // Overlay geometry: proxy geometry with scale baked in, then inflated
  // along recomputed normals — a uniform world-space offset even for
  // non-uniformly scaled proxies.
  const overlayGeometry = useMemo(() => {
    if (!selectedRegionId || !selectedTransform) return null;
    const g = buildProxyGeometry(selectedRegionId);
    g.scale(...selectedTransform.scale);
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * OVERLAY_INFLATE,
        pos.getY(i) + nor.getY(i) * OVERLAY_INFLATE,
        pos.getZ(i) + nor.getZ(i) * OVERLAY_INFLATE,
      );
    }
    pos.needsUpdate = true;
    return g;
  }, [selectedRegionId, selectedTransform]);

  useEffect(() => () => overlayGeometry?.dispose(), [overlayGeometry]);

  // Overlay opacity animates by mutating the material in useFrame — never
  // setState per frame (CLAUDE.md). Fade restarts whenever selection moves.
  const lastSelectedRef = useRef<RegionId | null>(null);
  useFrame((_, delta) => {
    if (selectedRegionId !== lastSelectedRef.current) {
      overlayMaterial.opacity = 0;
      lastSelectedRef.current = selectedRegionId;
    }
    if (selectedRegionId) {
      overlayMaterial.opacity = Math.min(
        OVERLAY_OPACITY,
        overlayMaterial.opacity +
          (delta / OVERLAY_FADE_SECONDS) * OVERLAY_OPACITY,
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
      {regionIds.map((id) => {
        const t = transforms.get(id)!;
        const isSelected = selectedRegionId === id;
        return (
          <mesh
            key={id}
            ref={(mesh) => mesh?.layers.enable(REGION_RAYCAST_LAYER)}
            geometry={geometries.get(id)}
            material={proxyMaterial}
            position={t.position}
            scale={t.scale}
            rotation={t.rotation}
            onClick={handleTap(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(id);
            }}
            onPointerOut={() => setHovered((h) => (h === id ? null : h))}
          >
            {/* Hover: outline only. Selected: outline + ember overlay
                (DESIGN.md). World-space thickness — screenspace mode
                misrenders on non-uniformly scaled meshes. */}
            {(isSelected || hovered === id) && (
              <Outlines thickness={0.02} color={EMBER} />
            )}
          </mesh>
        );
      })}

      {selectedRegionId && overlayGeometry && selectedTransform && (
        <mesh
          geometry={overlayGeometry}
          material={overlayMaterial}
          position={selectedTransform.position}
          rotation={selectedTransform.rotation}
          raycast={() => {}}
          renderOrder={1}
        />
      )}
    </group>
  );
}
