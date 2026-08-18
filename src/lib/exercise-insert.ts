import { normalizeBrandToken } from "@/lib/brand-search";
import { WORKOUT_CATEGORY } from "@/lib/categories";
import { syncPrimaryMatchKey } from "@/lib/codex-match-key";
import { prisma } from "@/lib/prisma";

/**
 * 운동 마스터 삽입·수정 규칙 **단일 출처** (D-227·D-228, `FR-11-A-01·04·09`).
 *
 * ## ⚠️ 왜 `insertCodex` 를 쓰지 않는가
 * `insertCodex` 는 **매칭 키로 도감을 만든다** — 카테고리의 `attributeKeys` 로
 * `normalizedKey` 를 조립한다. 운동 카테고리는 매칭 키가 **빈 배열**이므로
 * (`FR-10-A-02`, D-231) 그 경로를 그대로 쓰면 "매칭 키가 구성되지 않았습니다"
 * 로 막힌다. 운동의 식별자는 **운동명 하나**다 (`FR-11-A-09`).
 *
 * 그래서 이 파일이 있다. 다만 **정규화 함수와 `CodexMatchKey` 동기화는 같은
 * 것을 쓴다** — 그 둘이 갈리면 검색·병합이 운동만 다르게 동작한다
 * (D-190·D-197 이 겪은 자리).
 *
 * ## ⚠️ 부르는 곳이 넷이다 — 규칙을 여기 모은다
 * A-17 수동 등록 · A-17 AI 수집 등록 · A-18 요청 승인 · 시드 스크립트.
 * 넷이 각자 만들면 **`Exercise` 없는 반쪽 도감**이나 중복이 조용히 생긴다
 * (`FR-11-A-04`).
 */

/** `Exercise` 의 분류 4종 + 참고 영상. 전부 선택이다 */
export type ExerciseFields = {
  targetMuscles?: string[];
  equipmentType?: string | null;
  mechanic?: string | null;
  forceType?: string | null;
  referenceUrl?: string | null;
};

export type InsertExerciseResult =
  | { ok: true; exerciseId: string; codexId: string }
  | { ok: false; error: string; field?: string };

/**
 * 운동명 정규화 — **도감과 같은 규칙**을 쓴다 (D-014).
 *
 * ⚠️ 자체 정규화를 만들지 않는다. `바벨 벤치프레스` 와 `바벨벤치프레스` 가
 * 중복 판정에서 같아야 하고, 그 판정은 브랜드·도감이 이미 쓰는 규칙이다.
 */
export function normalizeExerciseName(name: string): string {
  return normalizeBrandToken(name);
}

/** 운동 카테고리 id — 없으면 시드가 안 돌았다 */
async function workoutCategoryId(): Promise<string | null> {
  const c = await prisma.category.findUnique({
    where: { key: WORKOUT_CATEGORY },
    select: { id: true },
  });
  return c?.id ?? null;
}

/**
 * ⚠️ 선택지에 없는 분류 값을 **버린다** (`FR-11-B-05·11`).
 *
 * AI 가 `코어`·`전신` 처럼 `AttributeOption` 에 없는 값을 낼 수 있다. 받아들이면
 * **근육맵이 칠할 수 없는 값**이 저장되고 자극부위 배지가 조용히 빈다 — 화면은
 * 멀쩡하고 값만 없는, 늦게 발견되는 실패다.
 *
 * @returns 살아남은 값과 버린 값. 버린 것은 **호출부가 표시해야 한다** — 조용히
 *   버리면 어드민이 왜 값이 비었는지 모른다 (D-188 의 교훈: 사유가 없으면 원인을
 *   못 짚는다)
 */
export async function sanitizeExerciseFields(
  fields: ExerciseFields,
): Promise<{ fields: ExerciseFields; dropped: string[] }> {
  const keys = ["targetMuscle", "equipmentType", "mechanic", "forceType"] as const;
  const rows = await prisma.attributeOption.findMany({
    where: { attributeDefinition: { key: { in: [...keys] } }, active: true },
    select: { key: true, attributeDefinition: { select: { key: true } } },
  });
  const allowed = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = allowed.get(r.attributeDefinition.key) ?? new Set<string>();
    set.add(r.key);
    allowed.set(r.attributeDefinition.key, set);
  }

  const dropped: string[] = [];
  const keep = (attr: string, value: string | null | undefined): string | null => {
    const v = value?.trim();
    if (!v) return null;
    if (allowed.get(attr)?.has(v)) return v;
    dropped.push(`${attr}=${v}`);
    return null;
  };

  const muscles = (fields.targetMuscles ?? [])
    .map((m) => keep("targetMuscle", m))
    .filter((m): m is string => Boolean(m));

  return {
    fields: {
      // 중복은 여기서 없앤다 — 근육맵은 집합으로 칠한다
      targetMuscles: [...new Set(muscles)],
      equipmentType: keep("equipmentType", fields.equipmentType),
      mechanic: keep("mechanic", fields.mechanic),
      forceType: keep("forceType", fields.forceType),
      // URL 은 선택지가 없다. 형식 검증은 `FR-11-A-02`/D-040 이 화면에서 한다
      referenceUrl: fields.referenceUrl?.trim() || null,
    },
    dropped,
  };
}

/**
 * 운동을 만든다 — `CodexItem` + `Exercise` 를 **한 트랜잭션**에 (`FR-11-A-04`).
 *
 * ⚠️ 반쪽만 만들어지면 도감 상세가 분류를 못 읽어 **빈 배지**가 뜬다. 화면은
 * 정상으로 보이므로 늦게 발견된다.
 *
 * ⚠️ **검증 상태는 호출부가 정한다.** 사람이 확인해 넣었으면 `VERIFIED`,
 * AI 수집분이면 `UNVERIFIED`(A-05 검수 대기) — D-185 가 정한 그대로다.
 */
export async function insertExercise(input: {
  displayName: string;
  fields: ExerciseFields;
  verification: "VERIFIED" | "UNVERIFIED";
  /** `VERIFIED` 일 때 검증자로 기록되는 `AdminUser.id` */
  actorId: string;
  descriptions?: { ko?: string; ja?: string; en?: string };
  /**
   * 언어별 표기 alias (D-009). `CodexItem.aliases` 에 들어가고 **검색이 이것을
   * 본다**.
   *
   * ⚠️ **없으면 그 언어 유저가 못 찾는다.** 3개 시장 서비스인데 마스터가 한국어
   * 이름뿐이면 영어권 유저는 `bench` 로 검색해 0건을 받는다 — 브랜드에서 겪은
   * 자리다 (D-047: "alias 가 없으면 브랜드가 없는 것으로 오인된다").
   */
  aliases?: { ko?: string[]; ja?: string[]; en?: string[] };
}): Promise<InsertExerciseResult> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { ok: false, error: "운동명을 입력해주세요", field: "displayName" };
  }

  const categoryId = await workoutCategoryId();
  if (!categoryId) {
    return { ok: false, error: "운동 카테고리가 없습니다 (시드를 먼저 돌려주세요)" };
  }

  /*
    ⚠️ **미검증 도감에 다국어 설명을 넣지 않는다** (`codex` FR-07-A-05).
    `insertCodex` 와 같은 규칙이다 — 미검증본의 설명 자리는 원문 전용이다.
  */
  if (input.verification === "UNVERIFIED" && input.descriptions) {
    return { ok: false, error: "미검증 도감에는 설명을 넣을 수 없습니다 (FR-07-A-05)" };
  }

  const normalizedKey = normalizeExerciseName(displayName);
  if (!normalizedKey) {
    return { ok: false, error: "운동명이 기호뿐입니다", field: "displayName" };
  }

  // 중복은 **정규화 이름**으로 본다 (`FR-11-A-09`)
  const dup = await prisma.codexItem.findFirst({
    where: { categoryId, normalizedKey },
    select: { displayName: true },
  });
  // 차단하고 **기존 것을 알려준다** — 그냥 막으면 어드민이 왜 막혔는지 모른다
  if (dup) {
    return {
      ok: false,
      error: `이미 있는 운동입니다 — "${dup.displayName}"`,
      field: "displayName",
    };
  }

  /*
    ⚠️ **키 alias 가 그 이름을 선점했을 수 있다** (D-192·D-194). 병합이 흡수한
    이름이 alias 로 남아 있으면 그 이름으로 새 운동을 만들면 안 된다 — 검색이
    두 곳을 가리키게 된다.
  */
  const taken = await prisma.codexMatchKey.findUnique({
    where: { categoryId_value: { categoryId, value: normalizedKey } },
    select: { kind: true, codexItem: { select: { displayName: true } } },
  });
  if (taken) {
    return {
      ok: false,
      error:
        taken.kind === "ALIAS"
          ? `다른 운동의 alias 로 쓰이는 이름입니다 — "${taken.codexItem.displayName}"`
          : `이미 있는 운동입니다 — "${taken.codexItem.displayName}"`,
      field: "displayName",
    };
  }

  const { fields } = await sanitizeExerciseFields(input.fields);
  const verified = input.verification === "VERIFIED";

  const made = await prisma.$transaction(async (tx) => {
    const codex = await tx.codexItem.create({
      data: {
        categoryId,
        displayName,
        normalizedKey,
        verification: input.verification,
        // ⚠️ 미검증본에는 검증자·일시를 남기지 않는다 (`insertCodex` 와 같은 이유)
        verifiedBy: verified ? input.actorId : null,
        verifiedAt: verified ? new Date() : null,
        descriptions: input.descriptions
          ? Object.fromEntries(
              Object.entries(input.descriptions).filter(([, v]) => v?.trim()),
            )
          : undefined,
        aliases: input.aliases
          ? Object.fromEntries(
              (["ko", "ja", "en"] as const)
                .map((k) => [
                  k,
                  [...new Set((input.aliases?.[k] ?? []).map((a) => a.trim()).filter(Boolean))],
                ])
                .filter(([, v]) => (v as string[]).length > 0),
            )
          : undefined,
      },
      select: { id: true },
    });
    /*
      ⚠️ **PRIMARY 매칭 키 행을 함께 만든다** (D-197). 운동은 유저 등록으로
      매칭되지 않지만(`FR-10-A-02`), 이 인덱스가 **alias 유일성과 병합**의
      기준이다 — 빠뜨리면 병합이 alias 를 넣을 자리를 찾지 못한다.
    */
    await syncPrimaryMatchKey(tx, {
      codexItemId: codex.id,
      categoryId,
      normalizedKey,
    });
    const exercise = await tx.exercise.create({
      data: {
        codexItemId: codex.id,
        targetMuscles: fields.targetMuscles ?? [],
        equipmentType: fields.equipmentType,
        mechanic: fields.mechanic,
        forceType: fields.forceType,
        referenceUrl: fields.referenceUrl,
      },
      select: { id: true },
    });
    return { codexId: codex.id, exerciseId: exercise.id };
  });

  return { ok: true, ...made };
}

/**
 * 이미 있는 **운동 도감을 마스터로 승격**한다 — `Exercise` 만 붙인다 (D-230).
 *
 * ## ⚠️ 왜 새로 만들지 않는가
 * 개편 전 운동 아이템이 만든 도감이 남아 있다. 이름이 같은 운동을 새로 만들려
 * 하면 `insertExercise` 가 중복으로 막는다 (`FR-11-A-09`) — 맞는 동작이다.
 *
 * 그때 할 일은 **그 도감을 마스터로 쓰는 것**이다. 새로 만들고 옛것을 지우면
 * 도감 id 가 바뀌어 **그 도감을 가리키던 착용샷·일기·알림이 끊긴다.**
 *
 * D-230 이 "봇 6종목의 분류 값을 재활용한다"고 한 것의 실제 모양이 이것이다.
 *
 * @returns 이미 `Exercise` 가 붙어 있으면 `already`
 */
export async function promoteCodexToExercise(input: {
  displayName: string;
  fields: ExerciseFields;
  /** 언어별 표기 alias — 옛 도감에는 없으므로 승격하면서 채운다 (D-009·D-047) */
  aliases?: { ko?: string[]; ja?: string[]; en?: string[] };
}): Promise<
  | { ok: true; exerciseId: string; codexId: string; already: boolean }
  | { ok: false; error: string }
> {
  const categoryId = await workoutCategoryId();
  if (!categoryId) return { ok: false, error: "운동 카테고리가 없습니다" };

  const normalizedKey = normalizeExerciseName(input.displayName);
  const codex = await prisma.codexItem.findFirst({
    where: { categoryId, normalizedKey },
    select: { id: true, aliases: true, exercise: { select: { id: true } } },
  });
  if (!codex) return { ok: false, error: "그 이름의 운동 도감이 없습니다" };

  /*
    ⚠️ **alias 병합을 `already` 앞에 둔다 — 이 스크립트는 멱등해야 한다.**
    처음 이것을 `already` 뒤에 뒀더니 두 번째 실행에서 alias 가 채워지지 않았다:
    1회차에 승격만 하고 2회차에는 `already` 로 빠져나갔기 때문이다. **멱등하다고
    적어둔 스크립트가 실제로는 1회차 상태에 의존**하고 있었다.

    옛 도감에는 언어별 표기 alias 가 없다(유저 등록이 만든 것이다). 없으면 ja/en
    유저가 그 운동을 찾을 수 없다 (D-009·D-047). 기존 값은 **덮지 않고 합친다** —
    어드민이 손으로 넣은 값이 있을 수 있다.
  */
  if (input.aliases) {
    const current = (codex.aliases ?? {}) as Record<string, unknown>;
    const merged: Record<string, string[]> = {};
    for (const k of ["ko", "ja", "en"] as const) {
      const existing = Array.isArray(current[k])
        ? (current[k] as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
      const add = (input.aliases[k] ?? []).map((a) => a.trim()).filter(Boolean);
      const all = [...new Set([...existing, ...add])];
      if (all.length > 0) merged[k] = all;
    }
    if (Object.keys(merged).length > 0) {
      await prisma.codexItem.update({ where: { id: codex.id }, data: { aliases: merged } });
    }
  }

  if (codex.exercise) {
    return { ok: true, exerciseId: codex.exercise.id, codexId: codex.id, already: true };
  }

  const { fields } = await sanitizeExerciseFields(input.fields);
  const made = await prisma.exercise.create({
    data: {
      codexItemId: codex.id,
      targetMuscles: fields.targetMuscles ?? [],
      equipmentType: fields.equipmentType,
      mechanic: fields.mechanic,
      forceType: fields.forceType,
      referenceUrl: fields.referenceUrl,
    },
    select: { id: true },
  });
  return { ok: true, exerciseId: made.id, codexId: codex.id, already: false };
}

/**
 * 도감 병합 시 **루틴 관계를 survivor 로 이관**한다 (`FR-05-B-12`, E-10-11).
 *
 * ## ⚠️ 왜 병합 액션 밖으로 떼어냈나
 * 액션 안에 두면 `getAdmin()` 을 거쳐야 해서 **스크립트로 검증할 수 없다** —
 * D-225 가 겪은 그대로다("검증할 수 없는 코드는 검증되지 않는다"). 병합에서
 * 가장 틀리기 쉬운 부분이 여기라 떼어내 직접 부를 수 있게 둔다.
 *
 * ## ⚠️ 같은 루틴에 승자가 이미 있으면 `@@unique` 가 막는다
 * 그때는 **내 설정이 많이 채워진 쪽을 남기고** 나머지 관계를 지운다 — 유저가
 * 적어둔 세트·중량을 버리지 않는 쪽을 고른다. 동점이면 순서가 앞선 것이다
 * (정렬이 안정적이어야 같은 입력에 같은 결과가 나온다).
 *
 * @param tx 병합 트랜잭션. **트랜잭션 안에서 불러야 한다** — 관계를 옮기는 도중에
 *   실패하면 절반만 옮겨진 루틴이 남고, 그 상태는 화면에서 정상처럼 보인다
 */
export async function migrateRoutinesToSurvivor(
  tx: Pick<typeof prisma, "exercise" | "routineExercise">,
  input: { survivorCodexId: string; absorbedCodexIds: string[] },
): Promise<{ moved: number; deduped: number }> {
  const survivor = await tx.exercise.findUnique({
    where: { codexItemId: input.survivorCodexId },
    select: { id: true },
  });
  // 운동 도감이 아니면 옮길 것이 없다 — 보통 카테고리의 병합이다
  if (!survivor) return { moved: 0, deduped: 0 };

  const losers = await tx.exercise.findMany({
    where: { codexItemId: { in: input.absorbedCodexIds } },
    select: { id: true },
  });
  const loserIds = losers.map((l) => l.id);
  if (loserIds.length === 0) return { moved: 0, deduped: 0 };

  const rows = await tx.routineExercise.findMany({
    where: { exerciseId: { in: [...loserIds, survivor.id] } },
    select: {
      id: true,
      routineItemId: true,
      exerciseId: true,
      displayOrder: true,
      sets: true,
      repsPerSet: true,
      restSeconds: true,
      workingWeight: true,
      rpe: true,
      tempo: true,
      machineSetting: true,
    },
  });

  const filled = (r: (typeof rows)[number]) =>
    [r.sets, r.repsPerSet, r.restSeconds, r.workingWeight, r.rpe, r.tempo, r.machineSetting].filter(
      (v) => v !== null,
    ).length;

  const byRoutine = new Map<string, typeof rows>();
  for (const r of rows) {
    byRoutine.set(r.routineItemId, [...(byRoutine.get(r.routineItemId) ?? []), r]);
  }

  let moved = 0;
  let deduped = 0;
  for (const [, group] of byRoutine) {
    const keep = [...group].sort(
      (a, b) => filled(b) - filled(a) || a.displayOrder - b.displayOrder,
    )[0];
    for (const r of group) {
      if (r.id === keep.id) continue;
      await tx.routineExercise.delete({ where: { id: r.id } });
      deduped++;
    }
    if (keep.exerciseId !== survivor.id) {
      await tx.routineExercise.update({
        where: { id: keep.id },
        data: { exerciseId: survivor.id },
      });
      moved++;
    }
  }
  return { moved, deduped };
}

