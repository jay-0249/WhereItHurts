import { CaptureScreen } from "@/components/CaptureScreen";

// SPEC-QUESTION: DESIGN.md §3.1 specifies a landing screen ("Show us where it
// hurts." + Start) before the canvas, but the first-milestone brief scopes to
// the tap→confirm→pin loop only, so / opens directly on the capture screen.
// Should the landing screen land together with the descriptor flow?
export default function Home() {
  return <CaptureScreen />;
}
