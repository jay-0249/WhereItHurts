"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEPRECATED_REGIONS,
  isRegionId,
  type BodyVariant,
  type RegionId,
} from "@/data/regions";
import { regionLabel } from "@/i18n/en";

/** PainRecord conforms to the schema in PLANNING.md §3 exactly — do not add fields ad hoc. */
export type PainQuality =
  | "sharp"
  | "dull"
  | "burning"
  | "throbbing"
  | "needle"
  | "pressure"
  | "cramping";

export type Trigger =
  | "constant"
  | "movement"
  | "position"
  | "breathing"
  | "touch"
  | "intermittent";

export type Duration = "new" | "days" | "weeks" | "months" | "episodic";

export interface PainRecord {
  id: string;
  createdAt: string;
  location: {
    regionId: string;
    regionLabel: string;
    mode: "tap" | "paint";
    paintedRegionIds?: string[];
  };
  depth?: "skin" | "muscle" | "deep" | "unsure";
  quality?: PainQuality[];
  trigger?: Trigger;
  intensity?: 1 | 2 | 3 | 4;
  duration?: Duration;
  conditional?: {
    [ruleId: string]: string | { travelsToRegionId: string };
  };
  freeText?: string;
}

export interface SessionProfile {
  ageBand?: string;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
}

interface PendingSelection {
  regionId: RegionId;
  /** true while the "Adjust" neighbor chips are showing */
  adjusting: boolean;
}

interface SessionState {
  pins: PainRecord[];
  profile: SessionProfile;
  /** null until the user picks a body on first visit */
  bodyVariant: BodyVariant | null;
  /** true while the chooser overlay is reopened from the canvas chip */
  choosingBody: boolean;
  pending: PendingSelection | null;
  reviewPinId: string | null;
  /** desktop hover feedback; ephemeral, never persisted */
  hoveredRegion: RegionId | null;

  setBodyVariant: (variant: BodyVariant) => void;
  openBodyChooser: () => void;
  selectRegion: (regionId: RegionId) => void;
  /** pass `ifCurrent` to clear only when that region is still hovered */
  setHoveredRegion: (regionId: RegionId | null, ifCurrent?: RegionId) => void;
  startAdjust: () => void;
  confirmPending: () => void;
  clearPending: () => void;
  openPinReview: (pinId: string) => void;
  closePinReview: () => void;
  deletePin: (pinId: string) => void;
}

declare global {
  interface Window {
    /** dev-only hook for the headless visual-verification script */
    __wih?: typeof useSession;
  }
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      pins: [],
      profile: {},
      bodyVariant: null,
      choosingBody: false,
      pending: null,
      reviewPinId: null,
      hoveredRegion: null,

      setHoveredRegion: (regionId, ifCurrent) => {
        if (regionId === null && ifCurrent !== undefined) {
          if (get().hoveredRegion === ifCurrent) set({ hoveredRegion: null });
          return;
        }
        set({ hoveredRegion: regionId });
      },

      setBodyVariant: (variant) =>
        set({ bodyVariant: variant, choosingBody: false }),

      openBodyChooser: () =>
        set({ choosingBody: true, pending: null, reviewPinId: null }),

      selectRegion: (regionId) =>
        set({ pending: { regionId, adjusting: false }, reviewPinId: null }),

      startAdjust: () => {
        const pending = get().pending;
        if (pending) set({ pending: { ...pending, adjusting: true } });
      },

      confirmPending: () => {
        const pending = get().pending;
        if (!pending) return;
        // SPEC-QUESTION: PLANNING.md §3 says regionLabel is "resolved from
        // i18n at render time, not stored logic", yet the schema includes the
        // field on the record. Storing the resolved English label at creation
        // keeps schema conformance; revisit when Phase 2 adds locales.
        const record: PainRecord = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          location: {
            regionId: pending.regionId,
            regionLabel: regionLabel(pending.regionId, get().bodyVariant),
            mode: "tap",
          },
        };
        set({ pins: [...get().pins, record], pending: null });
      },

      clearPending: () => set({ pending: null }),

      openPinReview: (pinId) => set({ reviewPinId: pinId, pending: null }),

      closePinReview: () => set({ reviewPinId: null }),

      deletePin: (pinId) =>
        set({
          pins: get().pins.filter((p) => p.id !== pinId),
          reviewPinId: null,
        }),
    }),
    {
      name: "whereithurts-session",
      // sessionStorage, NOT localStorage: pins survive a refresh, health data
      // clears when the tab closes (CLAUDE.md).
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        pins: state.pins,
        profile: state.profile,
        bodyVariant: state.bodyVariant,
      }),
      version: 2,
      // v1 -> v2: the region taxonomy was replaced (REGIONS.md). Map stale
      // ids through the deprecation table; drop pins that cannot map.
      migrate: (persisted: unknown) => {
        const state = persisted as {
          pins?: Array<{
            location?: { regionId?: string; regionLabel?: string };
            conditional?: Record<string, string | { travelsToRegionId: string }>;
          }>;
        } | null;
        if (!state?.pins) return state;
        const mapId = (id: string | undefined) =>
          id && isRegionId(id) ? id : DEPRECATED_REGIONS[id ?? ""] ?? null;
        state.pins = state.pins.filter((pin) => {
          const mapped = mapId(pin.location?.regionId);
          if (!mapped || !pin.location) return false;
          pin.location.regionId = mapped;
          pin.location.regionLabel = regionLabel(mapped);
          for (const value of Object.values(pin.conditional ?? {})) {
            if (typeof value === "object" && value.travelsToRegionId) {
              value.travelsToRegionId =
                mapId(value.travelsToRegionId) ?? value.travelsToRegionId;
            }
          }
          return true;
        });
        return state;
      },
    },
  ),
);

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__wih = useSession;
}
