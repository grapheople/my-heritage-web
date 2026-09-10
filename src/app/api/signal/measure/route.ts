import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { saveMeasurement } from "@/lib/signal/calibration";
import { driftSeconds } from "@/lib/signal/cycle";
import { getLights } from "@/lib/signal/lights";
import { loadProfile } from "@/lib/signal/resolve";

/**
 * 수동 주기 측정 — 사람이 신호등을 보면서 **3번 누른 시각**을 받는다.
 *
 * `POST /api/signal/measure?id=home`
 * ```json
 * { "greenStartAt": "…", "redStartAt": "…", "nextGreenStartAt": "…", "sentAt": "…" }
 * ```
 * 녹색이 켜진 순간 → 적색으로 바뀐 순간 → 다시 녹색이 켜진 순간. 이 세 개로
 * `greenSec`·`redSec`·기준 시각이 **한 번에** 나온다.
 *
 * ## ⚠️ 이 경로가 실질적인 1급 경로다
 * 실시간 개방(서울 C-ITS)은 교차로 단위라 집앞 신호등이 대상이 아닐 확률이 높고,
 * 인증키·활용신청도 필요하다. 반면 이 측정은 **아무 설정 없이 지금 당장** 되고,
 * 고정주기 신호등이라면 이것만으로 초 단위까지 맞는다.
 *
 * ## ⚠️ 시각은 **클라이언트 시계**로 받고 서버가 시차를 보정한다
 * 누른 순간은 클라이언트만 안다 — 서버 도착 시각을 쓰면 네트워크 지연이 그대로
 * 오차가 된다. 대신 기기 시계는 몇 초씩 틀리므로, 클라이언트가 POST 시각
 * (`sentAt`)을 함께 보내고 서버가 `지금 − sentAt` 만큼 세 시각을 통째로 민다.
 * **간격은 그대로 유지되고**(주기 길이는 영향 없음) 기준 시각만 서버 시계로 옮겨진다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * 측정값 상한·하한. 사람이 잘못 눌렀는지(두 번 연속 탭, 신호를 놓침) 걸러낸다.
 * ⚠️ 실측이라고 무조건 믿으면 오타 하나가 영구히 남는다 — 이력이라 되돌리려면
 * 다시 측정해야 하기 때문이다.
 */
const LIMITS = {
  greenSec: { min: 3, max: 180 },
  redSec: { min: 5, max: 600 },
} as const;

function parseMark(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const id = new URL(req.url).searchParams.get("id")?.trim();
  const lights = getLights();
  const light = id
    ? (lights.find((l) => l.id === id) ?? null)
    : lights.length === 1
      ? lights[0]
      : null;
  if (!light) {
    return NextResponse.json(
      {
        error: id ? `등록되지 않은 신호등이다: ${id}` : "id 가 필요하다",
        lights: lights.map((l) => ({ id: l.id, name: l.name })),
      },
      { status: id ? 404 : 400, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요하다" }, { status: 400, headers: NO_STORE });
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const green = parseMark(raw.greenStartAt);
  const red = parseMark(raw.redStartAt);
  const nextGreen = parseMark(raw.nextGreenStartAt);
  const sentAt = parseMark(raw.sentAt);
  if (green === null || red === null || nextGreen === null || sentAt === null) {
    return NextResponse.json(
      {
        error: "greenStartAt·redStartAt·nextGreenStartAt·sentAt 이 모두 필요하다 (ISO 8601)",
      },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!(green < red && red < nextGreen)) {
    return NextResponse.json(
      {
        error: "누른 순서가 맞지 않는다",
        hint: "녹색 시작 → 적색 전환 → 다음 녹색 시작 순서로 눌러야 한다",
      },
      { status: 422, headers: NO_STORE },
    );
  }
  if (nextGreen > sentAt + 5_000) {
    return NextResponse.json(
      { error: "마지막으로 누른 시각이 전송 시각보다 뒤다 — 기기 시계를 확인하라" },
      { status: 422, headers: NO_STORE },
    );
  }

  const greenSec = Math.round((red - green) / 1000);
  const redSec = Math.round((nextGreen - red) / 1000);
  for (const [key, value] of [["greenSec", greenSec], ["redSec", redSec]] as const) {
    const { min, max } = LIMITS[key];
    if (value < min || value > max) {
      return NextResponse.json(
        {
          error: `${key} 가 ${value}초로 측정됐다 — ${min}~${max}초 범위를 벗어난다`,
          hint: "신호를 놓쳤거나 두 번 연속 눌렀을 수 있다. 다시 측정하라",
          measured: { greenSec, redSec },
        },
        { status: 422, headers: NO_STORE },
      );
    }
  }

  const now = new Date();
  const loaded = await loadProfile(light, now);
  if (!loaded.ok) {
    return NextResponse.json(loaded.failure, { status: 409, headers: NO_STORE });
  }
  const { configured, profile } = loaded;

  /*
    시차 보정 — `지금 − sentAt` 만큼 민다. 네트워크 지연도 여기에 섞이지만
    (보통 수십~수백 ms) 기기 시계 오차보다 훨씬 작다.
  */
  const skewMs = now.getTime() - sentAt;
  const anchor = new Date(nextGreen + skewMs);

  const cycleSec = greenSec + redSec;
  const drift = driftSeconds(new Date(Date.parse(profile.greenStartAt)), anchor, cycleSec);

  const saved = await saveMeasurement({
    lightId: light.id,
    profileLabel: configured.label ?? null,
    greenStartAt: anchor,
    greenSec,
    redSec,
    driftSec: drift,
    requestedBy: viewer.userId,
  });

  return NextResponse.json(
    {
      applied: true,
      id: light.id,
      profile: configured.label ?? null,
      measured: { greenSec, redSec, cycleSec, measuredAt: saved.createdAt.toISOString() },
      greenStartAt: anchor.toISOString(),
      /*
        `GET /api/signal` 의 `calibration` 과 **같은 모양**으로 함께 낸다 — 화면이
        재조회 없이 즉시 갱신한다. 시각은 서버가 만든 값이어야 한다 (기기 시계가
        틀린 만큼 "마지막 동기화" 표시가 어긋나면, 시계 오차를 다루는 화면에서
        그건 그냥 버그로 읽힌다).
      */
      calibration: {
        syncedAt: saved.createdAt.toISOString(),
        driftSec: drift,
        source: "MANUAL" as const,
      },
      /** 참고용 — 이전 설정과 얼마나 달랐는가. 측정 자체의 정확도와는 무관하다 */
      drift: { seconds: drift, clockSkewMs: skewMs },
    },
    { headers: NO_STORE },
  );
}
