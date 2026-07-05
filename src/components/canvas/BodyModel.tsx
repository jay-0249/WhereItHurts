"use client";

import { useEffect, useMemo } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
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
 *
 * A proxy's three jobs: raycast target, tint volume (the highlight itself
 * is fragment tinting in BodyVisual's material), and pin centroid. Proxies
 * only need to ENCLOSE their body zone — they don't have to hug the
 * visual silhouette.
 */
export function BodyModel() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const selectRegion = useSession((s) => s.selectRegion);
  const hovered = useSession((s) => s.hoveredRegion);
  const setHoveredRegion = useSession((s) => s.setHoveredRegion);
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

  // Dev-only proxy visualization for mesh alignment passes: open the app
  // with ?proxies=1 to see every proxy volume tinted at 20% opacity.
  const debugProxies =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("proxies") === "1";

  const debugMaterials = useMemo(() => {
    if (!debugProxies) return null;
    const map = new Map<RegionId, THREE.MeshBasicMaterial>();
    regionIds.forEach((id, i) => {
      map.set(
        id,
        new THREE.MeshBasicMaterial({
          // golden-ratio hue steps give adjacent regions distinct colors
          color: new THREE.Color().setHSL((i * 0.618034) % 1, 0.7, 0.5),
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
    });
    return map;
  }, [debugProxies, regionIds]);

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
    };
  }, [geometries]);

  useEffect(() => () => proxyMaterial.dispose(), [proxyMaterial]);

  useEffect(
    () => () => debugMaterials?.forEach((m) => m.dispose()),
    [debugMaterials],
  );

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
        return (
          <mesh
            key={id}
            ref={(mesh) => mesh?.layers.enable(REGION_RAYCAST_LAYER)}
            geometry={geometries.get(id)}
            material={debugMaterials?.get(id) ?? proxyMaterial}
            position={t.position}
            scale={t.scale}
            rotation={t.rotation}
            onClick={handleTap(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredRegion(id);
            }}
            onPointerOut={() => setHoveredRegion(null, id)}
          />
        );
      })}
    </group>
  );
}
