import { NextResponse } from "next/server";
import { getLights } from "@/lib/signal/lights";
import { isFailure, resolveSignal } from "@/lib/signal/resolve";

/**
 * 신호등 잔여시간 조회.
 *
 * `GET /api/signal?id=home`
 * ```json
 * {
 *   "id": "home", "name": "집앞 횡단보도",
 *   "state": "red",
 *   "secondsRemaining": 42,      // 지금 상태가 끝날 때까지
 *   "nextGreenInSeconds": 42,    // 녹색이면 0
 *   "calibration": { "syncedAt": "…", "driftSec": 3 }  // 마지막 동기화
 * }
 * ```
 *
 * `id` 를 생략하면 등록된 신호등이 하나일 때는 그것으로 답하고, 여러 개면 목록을
 * 낸다. 설정은 `src/lib/signal/lights.ts` (또는 `SIGNAL_LIGHTS_JSON`).
 *
 * ## ⚠️ 이 엔드포인트는 외부 API 를 부르지 않는다
 * 신호 포털은 하루 호출 상한이 있어 상시 폴링에 쓸 수 없다. 실시간 조회는
 * `POST /api/signal/sync` 뿐이고, 여기서는 그 동기화가 맞춰 둔 **기준 시각**으로
 * 계산만 한다 — 그래서 몇 초마다 새로고침해도 쿼터가 줄지 않는다.
 *
 * ## ⚠️ 캐시를 절대 타지 않는다
 * 남은 초는 **1초마다 달라지는 값**이다. 라우트가 정적으로 굳거나 CDN 에 얹히면
 * 지나간 숫자를 계속 내보내는데, 값이 그럴듯해서 틀린 걸 알아채기 어렵다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  const lights = getLights();

  // ⚠️ 등록부를 **한 번만** 읽는다 — env 파싱 로그가 요청마다 두 번 찍혔다
  const light = id
    ? (lights.find((l) => l.id === id) ?? null)
    : lights.length === 1
      ? lights[0]
      : null;

  if (!light) {
    const ids = lights.map((l) => ({ id: l.id, name: l.name }));
    return NextResponse.json(
      {
        error: id ? `등록되지 않은 신호등이다: ${id}` : "id 가 필요하다",
        lights: ids,
      },
      { status: id ? 404 : 400, headers: NO_STORE },
    );
  }

  const result = await resolveSignal(light);
  if (isFailure(result)) {
    // 설정 문제다. 추측한 숫자를 내지 않는다 — 그럴듯한 오답이 제일 나쁘다
    return NextResponse.json(
      { ...result, id: light.id },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json(result, { headers: NO_STORE });
}
