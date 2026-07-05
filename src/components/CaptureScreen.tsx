"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSession } from "@/store/session";
import { en, regionLabel } from "@/i18n/en";
import { ConfirmSheet } from "./sheet/ConfirmSheet";

// The 3D scene is client-only; no point server-rendering a WebGL canvas.
const Scene = dynamic(() => import("./canvas/Scene").then((m) => m.Scene), {
  ssr: false,
});

export function CaptureScreen() {
  const pending = useSession((s) => s.pending);
  const pinCount = useSession((s) => s.pins.length);

  // Pins hydrate from sessionStorage; render the count only after mount so
  // server and client markup agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative flex h-dvh flex-col">
      <header className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between px-5">
        <h1 className="font-display text-body text-ink">{en.app.name}</h1>
        {mounted && pinCount > 0 && (
          <span className="rounded-chip bg-teal-soft px-3 py-1 text-chip font-medium text-teal">
            {en.canvas.pinCount(pinCount)}
          </span>
        )}
      </header>

      <div className="min-h-[55vh] flex-1">
        <Scene />
      </div>

      {/* Announce selections for screen readers (DESIGN.md §5 quality floor) */}
      <div aria-live="polite" className="sr-only">
        {pending ? en.canvas.selected(regionLabel(pending.regionId)) : ""}
      </div>

      <ConfirmSheet />
    </main>
  );
}
