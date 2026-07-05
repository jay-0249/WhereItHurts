"use client";

import { useSession } from "@/store/session";
import { en } from "@/i18n/en";
import type { BodyVariant } from "@/data/regions";

/**
 * First-visit body chooser, reopenable from the canvas chip. Copy never
 * uses gendered words; internal keys are body-a / body-b (DESIGN.md).
 * Rendered as an opaque overlay so the canvas beneath stays mounted.
 */
export function BodyChooser() {
  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-porcelain px-5">
      <h2 className="max-w-[420px] text-center font-display text-display leading-tight text-ink">
        {en.bodyChooser.title}
      </h2>
      <div className="mt-8 flex gap-4">
        <VariantButton
          variant="body-a"
          ariaLabel={en.bodyChooser.optionA}
          silhouette={<SilhouetteA />}
        />
        <VariantButton
          variant="body-b"
          ariaLabel={en.bodyChooser.optionB}
          silhouette={<SilhouetteB />}
        />
      </div>
      <p className="mt-6 text-chip text-slate">{en.bodyChooser.caption}</p>
    </div>
  );
}

function VariantButton({
  variant,
  ariaLabel,
  silhouette,
}: {
  variant: BodyVariant;
  ariaLabel: string;
  silhouette: React.ReactNode;
}) {
  const setBodyVariant = useSession((s) => s.setBodyVariant);
  return (
    <button
      onClick={() => setBodyVariant(variant)}
      aria-label={ariaLabel}
      className="rounded-card border border-line bg-card p-6 text-ink shadow-card"
    >
      {silhouette}
    </button>
  );
}

/* Schematic silhouettes — deliberately abstract, line-art in --ink. */

function SilhouetteA() {
  return (
    <svg width="80" height="160" viewBox="0 0 60 120" aria-hidden>
      <circle cx="30" cy="13" r="9" fill="currentColor" />
      <path
        fill="currentColor"
        d="M30 24 C 19 24 13 28 11 34 L15 62 L20 63 L18 112 L26 112 L29 72 L31 72 L34 112 L42 112 L40 63 L45 62 L49 34 C 47 28 41 24 30 24 Z"
      />
    </svg>
  );
}

function SilhouetteB() {
  return (
    <svg width="80" height="160" viewBox="0 0 60 120" aria-hidden>
      <circle cx="30" cy="13" r="9" fill="currentColor" />
      <path
        fill="currentColor"
        d="M30 24 C 22 24 17 27 15 33 L19 52 C 14 61 13 68 15 75 L22 78 L20 112 L27 112 L30 80 L33 112 L40 112 L38 78 L45 75 C 47 68 46 61 41 52 L45 33 C 43 27 38 24 30 24 Z"
      />
    </svg>
  );
}
