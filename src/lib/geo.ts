/**
 * 두 좌표 사이 거리 (m) — 하버사인.
 *
 * ⚠️ 신호등(`signal/intersections.ts`)과 대중교통(`transit/providers/tago-bus.ts`)이
 * 같은 계산을 쓴다. 두 벌로 두면 한쪽만 고쳐져 **같은 화면에서 거리가 다르게**
 * 나온다 — 한 곳에 둔다.
 */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
