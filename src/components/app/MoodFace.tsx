// A small line face for each mood on the check-in sheet. Eyes are zero-length strokes with round caps (dots), or
// short lines and arcs. A mood someone added themselves gets the plain face.

const FACES: Record<string, { eyes: string; mouth: string }> = {
  down: { eyes: "M9 10h.01M15 10h.01", mouth: "M9 16.2q3-2.6 6 0" },
  tired: { eyes: "M7.9 10.4h2.2M13.9 10.4h2.2", mouth: "M9.8 15.6h4.4" },
  normal: { eyes: "M9 10h.01M15 10h.01", mouth: "M9 15.2h6" },
  great: { eyes: "M9 10h.01M15 10h.01", mouth: "M8.2 13.8q3.8 4.2 7.6 0" },
  anxious: { eyes: "M9 10.4h.01M15 10.4h.01M7.8 8.4l2.4-.9M16.2 8.4l-2.4-.9", mouth: "M8.8 15.8q1.05-1 2.1 0t2.1 0 2.1 0" },
  focused: { eyes: "M9 10.6h.01M15 10.6h.01M7.8 8.2l2.6.7M16.2 8.2l-2.6.7", mouth: "M9.6 15.2q2.4 1 4.8 0" },
  peaceful: { eyes: "M8 10.2q1 1 2 0M14 10.2q1 1 2 0", mouth: "M9 14.4q3 2.4 6 0" },
  excited: { eyes: "M9 10h.01M15 10h.01", mouth: "M8.6 13.6h6.8q0 3.8-3.4 3.8t-3.4-3.8z" },
  overwhelmed: { eyes: "M8 9.2l2 2M10 9.2l-2 2M14 9.2l2 2M16 9.2l-2 2", mouth: "M9.5 16q2.5-1.6 5 0" },
  grateful: { eyes: "M8 10.2q1 1 2 0M14 10.2q1 1 2 0", mouth: "M8.6 14q3.4 3.6 6.8 0" },
};

export function MoodFace({ id, size = 34 }: { id: string; size?: number }) {
  const f = FACES[id] || FACES.normal;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d={f.eyes} strokeWidth={2.2} />
      <path d={f.mouth} />
    </svg>
  );
}
