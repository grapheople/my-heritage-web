import "./env";
import { deriveCodexSpecs, DERIVE_MIN_AGREEMENT, DERIVE_MIN_SAMPLE } from "../src/lib/data/codex-spec-derive";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 유저 아이템에서 **도감 스펙을 추정**한다 (D-312).
 *
 * ## ⚠️ 규칙은 여기 없다
 * 집계·게이트·우선순위는 전부 `src/lib/data/codex-spec-derive.ts` 에 있다.
 * 이 파일은 **대상 DB 를 보여주고 결과를 읽히게** 만드는 껍데기다 — 스크립트가
 * 자기 규칙을 들면 화면·어드민과 갈린다 (D-190·D-197·D-270 이 반복한 실패).
 *
 * ## ⚠️ 미리보기가 기본이다
 * `--apply` 없이는 아무것도 쓰지 않는다. 추정값은 **공용 사전에 오르는 값**이라
 * (D-015) 사람이 먼저 훑어야 한다 — D-185 가 조사 결과에 취한 태도와 같다.
 *
 * ## ⚠️ `충돌` 을 눈에 띄게 낸다
 * 조사·운영이 넣은 값과 유저 다수가 적은 값이 다르면 **둘 중 하나가 틀렸다.**
 * 도감 오류를 잡아낼 유일한 신호이므로 자동으로 고치지 않고 사람에게 보인다.
 *
 * ```
 * pnpm tsx prisma/derive-codex-specs.ts                    # 전체 미리보기
 * pnpm tsx prisma/derive-codex-specs.ts --category=watch
 * pnpm tsx prisma/derive-codex-specs.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");
const categoryKey = process.argv
  .find((a) => a.startsWith("--category="))
  ?.slice("--category=".length);

async function main() {
  console.log(`대상 DB — ${describeDatabase(migrationDatabaseUrl())}`);
  console.log(APPLY ? "모드: 적용" : "모드: 미리보기 (--apply 로 적용)");
  console.log(
    `게이트 — 표본 ${DERIVE_MIN_SAMPLE}건 이상 · 일치율 ${Math.round(
      DERIVE_MIN_AGREEMENT * 100,
    )}% 이상 · 동률 제외${categoryKey ? ` · 카테고리 ${categoryKey}` : ""}\n`,
  );

  const rows = await deriveCodexSpecs({ categoryKey, apply: APPLY });
  if (rows.length === 0) {
    /*
      ⚠️ **0건은 고장이 아니다.** 도감에 걸린 공개 아이템이 스펙을 안 적었으면
      추정할 재료가 없다 — 서비스 초기의 정상 상태다. "왜 0건인가"를 화면이
      말해주지 않으면 다음 사람이 스크립트를 의심한다
    */
    console.log("추정할 표본이 없습니다 — 도감에 연결된 공개 아이템의 스펙 값이 0건입니다");
    return;
  }

  const by = (d: string) => rows.filter((r) => r.decision === d);
  const written = by("write");
  const gate = by("gate");
  const outranked = by("outranked");
  const conflict = by("conflict");

  if (written.length > 0) {
    console.log(`${APPLY ? "채움" : "채울 것"} ${written.length}건`);
    for (const r of written) {
      const pct = Math.round(r.agreement * 100);
      console.log(`  ${r.displayName} · ${r.label} = ${r.raw} (표본 ${r.sampleSize} · 일치 ${pct}%)`);
    }
  }

  // ⚠️ 충돌을 맨 아래 묻지 않는다 — 이 스크립트가 내는 가장 중요한 신호다
  if (conflict.length > 0) {
    console.log(`\n⚠️ 충돌 ${conflict.length}건 — 기존 값과 유저 다수가 다릅니다 (자동 수정하지 않음)`);
    for (const r of conflict) {
      console.log(`  ${r.displayName} · ${r.label} — 유저 "${r.raw}" (표본 ${r.sampleSize}) / ${r.detail}`);
    }
  }

  if (gate.length > 0) {
    console.log(`\n게이트 미달 ${gate.length}건 (정상)`);
    for (const r of gate) console.log(`  ${r.displayName} · ${r.label} — ${r.detail}`);
  }
  if (outranked.length > 0) {
    console.log(`\n이미 더 확실한 값 ${outranked.length}건`);
  }

  if (!APPLY && written.length > 0) {
    console.log(`\n적용: pnpm tsx prisma/derive-codex-specs.ts${categoryKey ? ` --category=${categoryKey}` : ""} --apply`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
