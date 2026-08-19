"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { fail, type ActionResult } from "@/lib/actions/shared";
import { normalizeExerciseName } from "@/lib/exercise-insert";
import { searchExercisesForRoutine } from "@/lib/data/item";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/**
 * 유저 쪽 운동 액션 — **검색**(`FR-10-B-09`)과 **요청**(`FR-11-D-01~03`).
 *
 * ## ⚠️ 검색이 액션인 이유
 * 루틴 구성 화면은 클라이언트 컴포넌트다 (순서를 낙관적으로 바꾼다). 마스터가
 * 수백 건이 되면 **전부 내려보낼 수 없으므로** 입력에 따라 서버에 묻는다
 * (NFR-User — "입력 중 결과가 갱신되는 수준"). 별도 라우트 핸들러를 만들지 않은
 * 것은 인가 규칙이 액션과 같아야 하기 때문이다.
 *
 * ## ⚠️ 요청은 즉시 반영하지 않는다 (D-229)
 * 즉시 반영하면 도감이 다시 유저 입력이 되고, D-228 이 막은 유저 생성 경로가
 * 되살아난다. 어드민 A-18 이 승인해야 마스터에 들어간다.
 */

/** 루틴에 담을 운동을 찾는다 (`FR-10-B-09`) */
export async function searchExercises(input: {
  /** ⚠️ 등록 폼에는 아직 루틴이 없다 — 그때는 비운다 (D-236) */
  routineId?: string;
  q: string;
  locale: Locale;
}): Promise<{ id: string; name: string; muscles: string[]; codexId: string }[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  return searchExercisesForRoutine({
    routineId: input.routineId,
    viewer,
    q: input.q,
    locale: input.locale,
  });
}

/**
 * 마스터에 없는 운동을 **요청한다** (`FR-11-D-01·02·03·05`).
 *
 * ⚠️ **먼저 검색을 거치게 한다** (`FR-11-D-02`). 이미 있는 이름이면 요청을 만들지
 * 않고 그 운동을 알려준다 — alias 로도 본다(D-009). 그러지 않으면 큐가 "이미
 * 있는 것"으로 가득 차고, 어드민이 그것을 골라내는 일이 늘어난다.
 *
 * ⚠️ **같은 요청은 묶는다** (`FR-11-D-05`). 정규화 이름이 같은 대기 요청이 있으면
 * 새로 만들지 않는다 — `벤치 프레스` 와 `벤치프레스` 가 따로 쌓이면 어드민 큐에
 * 같은 요청이 두 줄로 보이고 우선순위를 못 잡는다.
 *
 * ⚠️ **경험치를 주지 않는다** (D-033 · 브랜드 요청 `FR-09-A-05` 와 같다). 요청은
 * 기록이 아니라 부탁이고, exp 를 붙이면 요청 자체가 파밍 수단이 된다.
 */
export async function requestExercise(input: {
  name: string;
}): Promise<ActionResult<{ merged?: boolean; existing?: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const name = input.name.trim();
  if (!name) return fail({ name: "운동명을 입력해주세요" });
  if (name.length > 100) return fail({ name: "운동명이 너무 깁니다" });

  const nq = normalizeExerciseName(name);
  if (!nq) return fail({ name: "운동명이 기호뿐입니다" });

  /*
    이미 마스터에 있는가 — **정식 명칭 또는 alias** (`FR-11-D-02`, D-009).
    ⚠️ 비활성 운동도 본다: 어드민이 내린 것을 다시 요청하는 것은 큐로 갈 일이
    아니라 **어드민이 판단할 일**이다. 그래서 존재를 알려주고 요청을 만들지 않는다.
  */
  const existing = await prisma.codexItem.findFirst({
    where: {
      category: { key: "workout" },
      OR: [{ normalizedKey: nq }, { matchKeys: { some: { value: nq } } }],
    },
    select: { displayName: true },
  });
  if (existing) {
    return fail({ name: `이미 있는 운동이에요 — "${existing.displayName}"을 검색해보세요` });
  }

  // 같은 요청이 대기 중이면 새로 만들지 않는다 (`FR-11-D-05`)
  const dup = await prisma.exerciseRequest.findFirst({
    where: { status: "PENDING", normalizedName: nq },
    select: { id: true },
  });
  if (dup) {
    // 유저에게는 성공이다 — 요청이 접수된 것은 맞다
    return { ok: true, merged: true };
  }

  await prisma.exerciseRequest.create({
    data: {
      requesterId: viewer.userId,
      requestedName: name,
      normalizedName: nq,
      status: "PENDING",
    },
  });

  revalidatePath("/admin/exercises/requests", "page");
  return { ok: true, merged: false };
}
