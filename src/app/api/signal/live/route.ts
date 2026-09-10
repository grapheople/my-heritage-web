import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getLights } from "@/lib/signal/lights";
import { parseDirection, parseKind, readLiveTarget, saveLiveTarget } from "@/lib/signal/live-target";
import { prisma } from "@/lib/prisma";

/**
 * 이 신호등의 실시간 조회 대상 저장 — 교차로 찾기의 **마지막 단계**.
 *
 * `PUT /api/signal/live?id=home`
 * ```json
 * { "itstId": "12345", "direction": "nt", "kind": "pedestrian" }
 * ```
 *
 * ⚠️ 포털을 부르지 않는다. 앞선 두 단계(`/intersections`·`/phases`)에서 이미
 * 확인한 값을 적어 두는 일이다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function PUT(req: Request) {
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
  const itstId = typeof raw.itstId === "string" ? raw.itstId.trim() : "";
  const direction = parseDirection(raw.direction);
  const kind = parseKind(raw.kind);
  if (!itstId || !direction || !kind) {
    return NextResponse.json(
      { error: "itstId·direction·kind 가 모두 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }

  /*
    ⚠️ 목록에 있는 교차로인지 확인한다. 오타 하나가 들어가면 이후 동기화가
    "필드가 없다"(502)로만 실패해서 원인이 교차로 ID 라는 걸 알기 어렵다.
    목록이 아직 비어 있으면(수집 전) 통과시킨다 — 미리 아는 값을 넣는 길을 막지 않는다.
  */
  const known = await prisma.signalIntersection.findUnique({
    where: { itstId },
    select: { name: true },
  });
  if (!known && (await prisma.signalIntersection.count()) > 0) {
    return NextResponse.json(
      { error: `교차로 목록에 없는 ID 다: ${itstId}`, hint: "/api/signal/intersections 로 찾은 값을 쓰라" },
      { status: 422, headers: NO_STORE },
    );
  }

  await saveLiveTarget({
    lightId: light.id,
    target: { itstId, direction, kind },
    updatedBy: viewer.userId,
  });

  return NextResponse.json(
    {
      applied: true,
      id: light.id,
      live: await readLiveTarget(light.id, light.live),
      intersectionName: known?.name ?? null,
    },
    { headers: NO_STORE },
  );
}
