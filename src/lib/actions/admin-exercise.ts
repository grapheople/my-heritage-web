"use server";

import { getAdmin } from "@/lib/auth/admin";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { botEnabled, botTargetDb, claudeConfigured } from "@/lib/bot/guard";
import { researchExercises, type ExerciseCandidate } from "@/lib/bot/claude";
import {
  insertExercise,
  normalizeExerciseName,
  sanitizeExerciseFields,
  type ExerciseFields,
} from "@/lib/exercise-insert";
import { prisma } from "@/lib/prisma";

/**
 * 어드민 운동 마스터 액션 — **A-17**(마스터) · **A-18**(요청 큐) (D-227~D-232).
 *
 * ## ⚠️ 운동 도감은 여기서만 생긴다
 * 다른 카테고리의 도감은 유저 등록이 만든다(D-032). 운동 카테고리는
 * `userCodexCreation = false` 라(D-231) 유저 경로가 통째로 건너뛴다 — **이 파일이
 * 유일한 생성 경로**다. 그래서 삽입 규칙을 `lib/exercise-insert.ts` 한 곳에 두고
 * 수동 등록·AI 수집·요청 승인·시드가 모두 그것을 부른다 (`FR-11-A-04`).
 *
 * ## ⚠️ 모든 액션이 어드민 인가를 다시 확인한다 (D-102)
 * 레이아웃 가드는 **화면**을 막을 뿐이다. Server Action 은 직접 호출될 수 있다.
 */

async function actor(): Promise<string | null> {
  return (await getAdmin())?.id ?? null;
}

/* ────────────────────────────────────────────
   A-17 운동 마스터 — 등록 · 수정 · 비활성화 · 삭제
   ──────────────────────────────────────────── */

/**
 * 운동 하나를 등록한다 (`FR-11-A-01·04·06`).
 *
 * ⚠️ **사람이 확인해서 넣은 것이므로 `VERIFIED`** 다 (`codex` FR-04-A-02).
 * AI 수집분은 `UNVERIFIED` 로 들어간다 (`FR-11-B-04`) — 그 차이가 A-05 검수 큐의
 * 의미를 지킨다.
 */
export async function createExercise(input: {
  displayName: string;
  fields: ExerciseFields;
  descriptions?: { ko?: string; ja?: string; en?: string };
}): Promise<ActionResult<{ exerciseId: string; codexId: string }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const res = await insertExercise({
    displayName: input.displayName,
    fields: input.fields,
    descriptions: input.descriptions,
    verification: "VERIFIED",
    actorId: ADMIN_ACTOR,
  });
  if (!res.ok) return res.field ? fail({ [res.field]: res.error }) : fail({}, res.error);

  revalidate("/admin/exercises", "/admin/codex");
  return { ok: true, exerciseId: res.exerciseId, codexId: res.codexId };
}

/**
 * 운동을 수정한다 (`FR-11-A-06`).
 *
 * ⚠️ **운동명을 바꾸면 정규화 이름도 바뀐다.** 다른 운동과 같아지면 **막는다**
 * (E-11-05) — 조용히 통과시키면 `@@unique([categoryId, normalizedKey])` 가
 * 터지거나(운 좋은 경우) 도감 두 개가 같은 것을 가리킨다. 합쳐야 하면 병합
 * 경로를 쓰라고 안내한다.
 *
 * ⚠️ **`CodexMatchKey` 의 PRIMARY 행도 함께 고친다.** 그것이 alias 유일성과 병합의
 * 기준이다 (D-197) — 이름만 바꾸면 검색 인덱스가 옛 이름을 가리킨 채 남는다.
 */
export async function updateExercise(input: {
  exerciseId: string;
  displayName: string;
  fields: ExerciseFields;
}): Promise<ActionResult<{ dropped?: string[] }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const ex = await prisma.exercise.findUnique({
    where: { id: input.exerciseId },
    select: { id: true, codexItemId: true, codexItem: { select: { categoryId: true } } },
  });
  if (!ex) return fail({}, "운동을 찾을 수 없습니다");

  const displayName = input.displayName.trim();
  if (!displayName) return fail({ displayName: "운동명을 입력해주세요" });
  const normalizedKey = normalizeExerciseName(displayName);
  if (!normalizedKey) return fail({ displayName: "운동명이 기호뿐입니다" });

  const clash = await prisma.codexItem.findFirst({
    where: {
      categoryId: ex.codexItem.categoryId,
      normalizedKey,
      id: { not: ex.codexItemId },
    },
    select: { displayName: true },
  });
  if (clash) {
    return fail({
      displayName: `"${clash.displayName}" 와 같은 이름이 됩니다 — 합치려면 도감 병합을 쓰세요`,
    });
  }

  const { fields, dropped } = await sanitizeExerciseFields(input.fields);

  await prisma.$transaction(async (tx) => {
    await tx.codexItem.update({
      where: { id: ex.codexItemId },
      data: { displayName, normalizedKey },
    });
    // PRIMARY 행을 새 값으로 옮긴다 (D-197). ALIAS 행은 건드리지 않는다
    await tx.codexMatchKey.updateMany({
      where: { codexItemId: ex.codexItemId, kind: "PRIMARY" },
      data: { value: normalizedKey },
    });
    await tx.exercise.update({
      where: { id: ex.id },
      data: {
        targetMuscles: fields.targetMuscles ?? [],
        equipmentType: fields.equipmentType,
        mechanic: fields.mechanic,
        forceType: fields.forceType,
        referenceUrl: fields.referenceUrl,
      },
    });
  });

  revalidate("/admin/exercises", "/admin/codex");
  // 버린 값을 **돌려준다** — 조용히 버리면 어드민이 왜 비었는지 모른다 (D-188)
  return dropped.length > 0 ? { ok: true, dropped } : { ok: true };
}

/**
 * 활성·비활성 전환 (`FR-11-A-07`).
 *
 * ⚠️ **비활성화해도 이미 담긴 루틴에서 빼지 않는다** (`FR-10-B-08`). 유저가 만든
 * 순서가 깨지기 때문이다 — 검색 후보에서만 빠진다. 그래서 여기서 관계를 지우는
 * 코드를 두지 않는다.
 */
export async function setExerciseActive(
  exerciseId: string,
  active: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  await prisma.exercise.update({ where: { id: exerciseId }, data: { active } });
  revalidate("/admin/exercises");
  return { ok: true };
}

/**
 * 삭제 — **사용 0건일 때만** (`FR-11-A-08`, D-036 의 태도).
 *
 * ⚠️ 사용 중이면 **비활성화를 안내한다.** 지우면 유저 루틴에서 운동이 사라지고
 * 그 자리에 남는 것은 순서 구멍이다.
 *
 * ⚠️ `CodexItem` 까지 함께 지운다 — `Exercise` 만 지우면 **분류 없는 운동 도감**이
 * 남는다 (`FR-11-A-04` 의 반대 방향 사고).
 */
export async function deleteExercise(exerciseId: string): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const ex = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { codexItemId: true, _count: { select: { routines: true } } },
  });
  if (!ex) return fail({}, "운동을 찾을 수 없습니다");
  if (ex._count.routines > 0) {
    return fail(
      {},
      `${ex._count.routines}개 루틴에서 쓰는 중입니다 — 비활성화를 쓰세요 (FR-11-A-07)`,
    );
  }

  // `Exercise` 는 `CodexItem` 에 Cascade 로 매달려 있다 — 도감을 지우면 함께 간다
  await prisma.codexItem.delete({ where: { id: ex.codexItemId } });

  revalidate("/admin/exercises", "/admin/codex");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-17 AI 수집 (D-232) — 로컬 전용
   ──────────────────────────────────────────── */

/** 한 번에 수집할 수 있는 건수 상한 — CLI 응답이 길어지면 잘린다 */
const RESEARCH_MAX = 12;

/**
 * AI 로 운동 후보를 수집한다 — **등록하지 않고 돌려준다** (`FR-11-B-01·02`).
 *
 * ## ⚠️ 두 겹으로 막힌다 (D-146·D-185 상속, `FR-11-B-09`)
 * 1. **어드민**이어야 한다 — 액션은 직접 호출될 수 있다 (D-102)
 * 2. **로컬 개발 모드**여야 한다 — 프로덕션 런타임에 `claude` 바이너리가 없다
 *
 * ## ⚠️ "로컬"이 "안전"을 뜻하지 않는다
 * 로컬 런타임은 **프로덕션 Supabase 를 볼 수 있다** (D-117). 수집만으로는 아무것도
 * 쓰지 않지만 이어지는 등록은 실제 서비스에 도감을 만든다 — 그래서 대상 DB 를
 * 함께 돌려준다. 어디에 쓰는지 보이지 않는 쓰기가 D-116 의 본질이었다.
 */
export async function researchExerciseCandidates(input: {
  /** 부위·장비 등 조건 (예: "가슴, 바벨") */
  hint: string;
  count: number;
}): Promise<
  ActionResult<{ candidates: ExerciseCandidate[]; dropped: string[]; targetDb: string }>
> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  if (!botEnabled()) return fail({}, "AI 수집은 로컬 개발 모드에서만 동작합니다 (D-232)");
  if (!claudeConfigured()) {
    return fail({}, "로컬 claude CLI 를 찾을 수 없습니다 (CLAUDE_CLI_PATH)");
  }

  const count = Math.min(Math.max(Math.trunc(input.count) || 1, 1), RESEARCH_MAX);

  /*
    ⚠️ **선택지를 DB 에서 읽어 프롬프트에 넣는다** (`FR-11-B-05`). 프롬프트 파일에
    목록을 박으면 어드민이 A-04 에서 선택지를 고친 순간 프롬프트만 옛 목록으로
    남는다 — 그러면 모델이 없는 값을 내고 코드가 버려서 **자극부위가 조용히 빈다**
  */
  const optionRows = await prisma.attributeOption.findMany({
    where: {
      attributeDefinition: {
        key: { in: ["targetMuscle", "equipmentType", "mechanic", "forceType"] },
      },
      active: true,
    },
    orderBy: { displayOrder: "asc" },
    select: { key: true, attributeDefinition: { select: { key: true } } },
  });
  const pick = (attr: string) =>
    optionRows.filter((o) => o.attributeDefinition.key === attr).map((o) => o.key);
  const options = {
    muscles: pick("targetMuscle"),
    equipment: pick("equipmentType"),
    mechanics: pick("mechanic"),
    forces: pick("forceType"),
  };
  if (options.muscles.length === 0) {
    // 여기서 막지 않으면 모델에게 빈 목록을 주고 그럴싸한 JSON 을 받는다 —
    // 조용히 잘못된 결과가 나온다 (`codex` 조사가 겪은 자리)
    return fail({}, "운동 속성 선택지가 설정되지 않았습니다 (A-04 / 시드)");
  }

  const res = await researchExercises({ hint: input.hint, count, options });

  /*
    ⚠️ **이미 있는 이름을 후보에서 뺀다** (`FR-11-B-03`). 정규화해서 본다 —
    `바벨  벤치프레스`(공백 2개)가 새 후보로 보이면 어드민이 등록을 눌렀다가
    실패를 받는다. 사유를 함께 낸다 (D-188 — 사유가 없으면 원인을 못 짚는다)
  */
  const existing = await prisma.codexItem.findMany({
    where: { category: { key: "workout" } },
    select: { normalizedKey: true, displayName: true },
  });
  const taken = new Map(existing.map((e) => [e.normalizedKey, e.displayName]));

  const fresh: ExerciseCandidate[] = [];
  const dropped = [...res.dropped];
  for (const c of res.candidates) {
    const hit = taken.get(normalizeExerciseName(c.displayName));
    if (hit) dropped.push(`${c.displayName} — 이미 있음 ("${hit}")`);
    else fresh.push(c);
  }

  return { ok: true, candidates: fresh, dropped, targetDb: botTargetDb() };
}

/**
 * 수집 후보를 **골라 등록한다** (`FR-11-B-02·04`).
 *
 * ⚠️ **미검증으로 들어간다** (`FR-11-B-04`). 사람이 식별 값을 확인하지 않았다 —
 * A-05 검수를 거쳐야 검증 배지가 붙는다. 여기서 `VERIFIED` 로 넣을 길을 만들지
 * 않는다 (D-185 가 정한 그대로).
 *
 * ⚠️ **일부 실패가 성공을 되돌리지 않는다** (`codex` FR-04-A-11). 행별 결과를
 * 돌려준다 — 전체 실패로 만들면 어드민이 어느 것이 들어갔는지 모른다.
 */
export async function createExercisesFromResearch(input: {
  candidates: ExerciseCandidate[];
}): Promise<ActionResult<{ created: number; results: { name: string; error?: string }[] }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const results: { name: string; error?: string }[] = [];
  let created = 0;
  for (const c of input.candidates) {
    const res = await insertExercise({
      displayName: c.displayName,
      fields: {
        targetMuscles: c.targetMuscles,
        equipmentType: c.equipmentType,
        mechanic: c.mechanic,
        forceType: c.forceType,
        referenceUrl: null,
      },
      // 조사분은 미검증이다 (D-185)
      verification: "UNVERIFIED",
      actorId: ADMIN_ACTOR,
    });
    if (res.ok) {
      created++;
      results.push({ name: c.displayName });
    } else {
      results.push({ name: c.displayName, error: res.error });
    }
  }

  revalidate("/admin/exercises", "/admin/codex", "/admin/codex/verification");
  return { ok: true, created, results };
}

/* ────────────────────────────────────────────
   A-18 운동 요청 큐 (D-229)
   ──────────────────────────────────────────── */

/**
 * 요청을 승인·반려한다 (`FR-11-D-04·06·07`).
 *
 * ## ⚠️ 같은 요청은 함께 처리한다
 * 정규화 이름이 같은 대기 요청을 **한 번에** 닫는다 (`FR-11-D-05`). 하나만 닫으면
 * 나머지가 큐에 남아 "이미 있는 운동" 요청으로 계속 보인다 — 브랜드 요청(D-047)이
 * 겪은 자리와 같다.
 *
 * ## ⚠️ 반려에는 두 종류가 있다 (`FR-11-D-07`)
 * | 상황 | 처리 |
 * |---|---|
 * | 이미 있는 운동을 다른 이름으로 요청 | `existingExerciseId` 지정 → **요청명을 alias 로 흡수** |
 * | 운동으로 볼 수 없는 요청 | 그냥 반려 |
 *
 * **alias 로 흡수하지 않으면 같은 요청이 다시 온다.** 유저는 자기가 아는 이름으로
 * 검색하고, 그 이름이 어디에도 없으면 또 요청한다.
 */
export async function resolveExerciseRequest(input: {
  requestId: string;
  approve: boolean;
  /** 승인 시 만들 운동의 분류. 비워도 등록된다 (나중에 A-17 에서 채운다) */
  fields?: ExerciseFields;
  /** 승인 시 쓸 정식 명칭. 비우면 요청명을 그대로 쓴다 */
  displayName?: string;
  /** 반려 시 지정하는 기존 운동 — 요청명을 이 운동의 alias 로 흡수한다 */
  existingExerciseId?: string;
  note?: string;
}): Promise<ActionResult<{ notified: number }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const req = await prisma.exerciseRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, requestedName: true, normalizedName: true, status: true },
  });
  if (!req) return fail({}, "요청을 찾을 수 없습니다");
  if (req.status !== "PENDING") return fail({}, "이미 처리된 요청입니다");

  // 같은 이름의 대기 요청 전부 (`FR-11-D-05`)
  const group = await prisma.exerciseRequest.findMany({
    where: { status: "PENDING", normalizedName: req.normalizedName },
    select: { id: true, requesterId: true },
  });

  let resolvedExerciseId: string | null = null;

  if (input.approve) {
    const res = await insertExercise({
      displayName: (input.displayName ?? req.requestedName).trim(),
      fields: input.fields ?? {},
      // ⚠️ 요청 승인은 **사람이 판단한 것**이므로 검증본이다 (A-05 큐를 늘리지 않는다)
      verification: "VERIFIED",
      actorId: ADMIN_ACTOR,
    });
    if (!res.ok) return res.field ? fail({ [res.field]: res.error }) : fail({}, res.error);
    resolvedExerciseId = res.exerciseId;
  } else if (input.existingExerciseId) {
    /*
      ⚠️ **요청명을 alias 로 흡수한다** (`FR-11-D-07`, AC-11-D-07-1). `CodexItem.aliases`
      (언어별 표기)가 아니라 **`CodexMatchKey` 의 ALIAS 행**을 쓴다 — 검색이 그
      인덱스를 보고(D-192), 유일성도 거기서 판정된다.
    */
    const target = await prisma.exercise.findUnique({
      where: { id: input.existingExerciseId },
      select: { id: true, codexItemId: true, codexItem: { select: { categoryId: true } } },
    });
    if (!target) return fail({}, "지정한 운동을 찾을 수 없습니다");

    const clash = await prisma.codexMatchKey.findUnique({
      where: {
        categoryId_value: {
          categoryId: target.codexItem.categoryId,
          value: req.normalizedName,
        },
      },
      select: { codexItemId: true },
    });
    // 이미 그 값이 쓰이고 있으면 **덮어쓰지 않는다** — 다른 운동을 가리킬 수 있다
    if (!clash) {
      await prisma.codexMatchKey.create({
        data: {
          codexItemId: target.codexItemId,
          categoryId: target.codexItem.categoryId,
          value: req.normalizedName,
          kind: "ALIAS",
          source: "ADMIN",
        },
      });
    }
    resolvedExerciseId = target.id;
  }

  const notified = await prisma.$transaction(async (tx) => {
    await tx.exerciseRequest.updateMany({
      where: { id: { in: group.map((g) => g.id) } },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        reviewedBy: ADMIN_ACTOR,
        reviewedAt: new Date(),
        note: input.note?.trim() || null,
        resolvedExerciseId,
      },
    });

    /*
      요청자 전원에게 결과 알림 (`FR-11-D-06`, D-087).
      ⚠️ **탈퇴한 유저는 제외한다** (E-11-07) — 알림 행이 남아도 읽을 사람이 없고,
      `User` 가 지워졌으면 FK 가 막는다
    */
    const requesters = [...new Set(group.map((g) => g.requesterId))];
    const alive = await tx.user.findMany({
      where: { id: { in: requesters }, deletedAt: null },
      select: { id: true },
    });
    if (alive.length > 0) {
      await tx.notification.createMany({
        data: alive.map((u) => ({
          userId: u.id,
          type: "EXERCISE_REQUEST_RESULT" as const,
          params: {
            exercise: req.requestedName,
            result: input.approve ? "approved" : "rejected",
          },
        })),
      });
    }
    return alive.length;
  });

  revalidate("/admin/exercises/requests", "/admin/exercises");
  return { ok: true, notified };
}
