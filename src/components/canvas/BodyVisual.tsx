"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { useSession } from "@/store/session";
import { REGION_IDS, isRegionId, type RegionId } from "@/data/regions";
import { computeFitFromBounds, fitsMatch } from "@/lib/body-fit.mjs";
import { BODY_VARIANTS, manifestForVariant } from "./body-variants";

/**
 * Raycast layer for the selectable body. Scene.tsx restricts the event
 * raycaster to this layer so the floor/stage can never intercept taps.
 */
export const REGION_RAYCAST_LAYER = 1;

const SELECT_OPACITY = 0.35; // ember wash at 35% (DESIGN.md)
const HOVER_OPACITY = 0.15;
const FADE_SECONDS = 0.2; // fades in over 200ms (DESIGN.md §4)
const TAP_SLOP_PX = 5; // pointer moved further than this = rotate, not tap

interface TintShader {
  uniforms: Record<string, THREE.IUniform>;
}

interface BodyGeometry {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  labels: Uint16Array;
  tintAttr: THREE.BufferAttribute;
}

/**
 * THE body: a single continuous labeled mesh. Every vertex carries a
 * region index baked into the GLB as the `_REGION` attribute
 * (scripts/bake-labels.mjs); taps raycast this mesh directly and read the
 * label off the hit triangle.
 *
 * PICK RULE (REGIONS.md §3 — runtime and tests must agree): the region is
 * the label of the hit triangle's corner with the LARGEST barycentric
 * coordinate at the hit point; ties break to the lowest vertex index.
 *
 * TINT: a per-vertex vec2 mask attribute (x=selected, y=hovered) mixed
 * with ember in the fragment shader. NEVER compare an interpolated region
 * index in the shader: interpolating between labels 7 and 63 sweeps
 * through every index between them and paints phantom stripes at region
 * borders (REGIONS.md §4).
 */
export function BodyVisual() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const selectRegion = useSession((s) => s.selectRegion);
  const setHoveredRegion = useSession((s) => s.setHoveredRegion);
  const hovered = useSession((s) => s.hoveredRegion);
  useCursor(hovered !== null);

  const { glbPath } = BODY_VARIANTS[variant];
  const { scene } = useGLTF(glbPath);

  const shaderRef = useRef<TintShader | null>(null);

  // Dev-only region atlas (?atlas=1): every labeled patch tinted in a
  // distinct hue via a baked vertex-color attribute — label holes would
  // appear as untinted grey skin (the bake makes them impossible, this
  // view proves it to the eye).
  const atlasMode =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("atlas") === "1";

  const clayMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#C9B8A8",
      roughness: 0.85,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uSelOpacity: { value: 0 },
        uHovOpacity: { value: 0 },
        uTintColor: { value: new THREE.Color("#E4572E") },
        uAtlasMix: { value: atlasMode ? 0.55 : 0 },
      });
      shader.vertexShader =
        [
          "attribute vec2 aTint;",
          "varying vec2 vTint;",
          atlasMode ? "attribute vec3 aAtlas;" : "",
          atlasMode ? "varying vec3 vAtlas;" : "",
          "",
        ].join("\n") +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          [
            "#include <begin_vertex>",
            "  vTint = aTint;",
            atlasMode ? "  vAtlas = aAtlas;" : "",
          ].join("\n"),
        );
      shader.fragmentShader =
        [
          "varying vec2 vTint;",
          "uniform float uSelOpacity;",
          "uniform float uHovOpacity;",
          "uniform vec3 uTintColor;",
          "uniform float uAtlasMix;",
          atlasMode ? "varying vec3 vAtlas;" : "",
          "",
        ].join("\n") +
        shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          [
            "#include <dithering_fragment>",
            atlasMode
              ? "gl_FragColor.rgb = mix(gl_FragColor.rgb, vAtlas, uAtlasMix);"
              : "",
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, uTintColor, uHovOpacity * vTint.y);",
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, uTintColor, uSelOpacity * vTint.x);",
          ].join("\n"),
        );
      shaderRef.current = shader;
    };
    return mat;
  }, [atlasMode]);
  useEffect(() => () => clayMaterial.dispose(), [clayMaterial]);

  const body = useMemo<BodyGeometry>(() => {
    const root = scene.clone(true);
    let mesh: THREE.Mesh | null = null;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !mesh) mesh = obj as THREE.Mesh;
    });
    if (!mesh) throw new Error("body glb contains no mesh");
    const m = mesh as THREE.Mesh;
    m.material = clayMaterial;
    m.layers.enable(REGION_RAYCAST_LAYER);

    const geometry = m.geometry as THREE.BufferGeometry;
    const regionAttr =
      geometry.getAttribute("_region") ?? geometry.getAttribute("_REGION");
    if (!regionAttr) {
      throw new Error(
        "glb carries no _REGION labels — run `npm run bake` (a GLB without labels never ships, REGIONS.md §8)",
      );
    }
    const labels = new Uint16Array(regionAttr.array as ArrayLike<number>);
    const count = geometry.getAttribute("position").count;
    if (labels.length !== count) {
      throw new Error(`label count ${labels.length} != vertex count ${count}`);
    }

    // IDEMPOTENT attribute creation: the geometry is shared with the
    // useGLTF cache and this memo may run twice under StrictMode — a fresh
    // BufferAttribute per run would leave the committed useFrame closure
    // writing to an orphan while the geometry renders the other copy.
    let tintAttr = geometry.getAttribute("aTint") as
      | THREE.BufferAttribute
      | undefined;
    if (!tintAttr || tintAttr.count !== count) {
      tintAttr = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
      geometry.setAttribute("aTint", tintAttr);
    }

    if (atlasMode && !geometry.getAttribute("aAtlas")) {
      const colors = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        // same golden-ratio palette convention as the old debug views,
        // keyed by the stable REGION_IDS index
        c.setHSL((labels[i] * 0.618034) % 1, 0.7, 0.5);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geometry.setAttribute("aAtlas", new THREE.BufferAttribute(colors, 3));
    }

    // shared auto-fit: same frame as the bake's landmarks/manifest
    const box = new THREE.Box3().setFromObject(root);
    const fit = computeFitFromBounds(box.min.toArray(), box.max.toArray());
    root.scale.setScalar(fit.scale);
    root.position.set(
      -fit.center[0] * fit.scale,
      -fit.center[1] * fit.scale,
      -fit.center[2] * fit.scale,
    );
    if (process.env.NODE_ENV === "development") {
      const recorded = manifestForVariant(variant).fit;
      if (!fitsMatch(fit, recorded)) {
        console.error(
          `[body-fit] ${variant}: runtime auto-fit does not match the bake's ` +
            `recorded fit — labels/manifest live in a different frame. Re-run npm run bake.`,
        );
      }
    }
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      // inspection hook for the headless visual-verification tooling
      (window as unknown as { __wihBody?: object }).__wihBody = {
        labels,
        tintAttr,
        getShader: () => shaderRef.current,
      };
    }
    return { root, mesh: m, labels, tintAttr };
  }, [scene, clayMaterial, variant, atlasMode]);

  /**
   * The single pick rule: nearest triangle corner by barycentric weight,
   * ties to the lowest vertex index.
   */
  const pickRegion = (event: ThreeEvent<PointerEvent | MouseEvent>): RegionId | null => {
    const face = event.face;
    if (!face) return null;
    const geometry = body.mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    const local = body.mesh.worldToLocal(event.point.clone());
    const corners = [face.a, face.b, face.c];
    const pa = new THREE.Vector3().fromBufferAttribute(position, face.a);
    const pb = new THREE.Vector3().fromBufferAttribute(position, face.b);
    const pc = new THREE.Vector3().fromBufferAttribute(position, face.c);
    const bary = new THREE.Vector3();
    THREE.Triangle.getBarycoord(local, pa, pb, pc, bary);
    const weights = [bary.x, bary.y, bary.z];
    let best = 0;
    for (let i = 1; i < 3; i++) {
      const tie = weights[i] === weights[best] && corners[i] < corners[best];
      if (weights[i] > weights[best] || tie) best = i;
    }
    const id = REGION_IDS[body.labels[corners[best]]];
    return id && isRegionId(id) ? id : null;
  };

  const handleTap = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > TAP_SLOP_PX) return;
    event.stopPropagation();
    const id = pickRegion(event);
    if (!id) return;
    navigator.vibrate?.(10);
    selectRegion(id);
  };

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    const id = pickRegion(event);
    if (id && id !== useSession.getState().hoveredRegion) {
      setHoveredRegion(id);
    }
  };

  // Tint masks + opacity fades: mutate attributes/uniforms in useFrame,
  // never React state per frame (CLAUDE.md).
  const lastSelRef = useRef<RegionId | null>(null);
  const lastHovRef = useRef<RegionId | null>(null);
  useFrame((_, delta) => {
    const shader = shaderRef.current;
    if (!shader) return;
    const state = useSession.getState();
    const sel = state.pending?.regionId ?? null;
    const hov = state.hoveredRegion;

    if (sel !== lastSelRef.current || hov !== lastHovRef.current) {
      const selIdx = sel ? REGION_IDS.indexOf(sel) : -1;
      const hovIdx = hov ? REGION_IDS.indexOf(hov) : -1;
      const arr = body.tintAttr.array as Float32Array;
      const labels = body.labels;
      for (let i = 0; i < labels.length; i++) {
        arr[i * 2] = labels[i] === selIdx ? 1 : 0;
        arr[i * 2 + 1] = labels[i] === hovIdx ? 1 : 0;
      }
      body.tintAttr.needsUpdate = true;
      if (sel !== lastSelRef.current) shader.uniforms.uSelOpacity.value = 0;
      lastSelRef.current = sel;
      lastHovRef.current = hov;
    }

    const step = (delta / FADE_SECONDS) * SELECT_OPACITY;
    const selTarget = sel ? SELECT_OPACITY : 0;
    const hovTarget = hov && hov !== sel ? HOVER_OPACITY : 0;
    for (const [key, target] of [
      ["uSelOpacity", selTarget],
      ["uHovOpacity", hovTarget],
    ] as const) {
      const current = shader.uniforms[key].value as number;
      shader.uniforms[key].value =
        current + Math.sign(target - current) * Math.min(Math.abs(target - current), step);
    }
  });

  return (
    <primitive
      object={body.root}
      onClick={handleTap}
      onPointerMove={handleMove}
      onPointerOut={() => setHoveredRegion(null)}
    />
  );
}

for (const config of Object.values(BODY_VARIANTS)) {
  useGLTF.preload(config.glbPath);
}
