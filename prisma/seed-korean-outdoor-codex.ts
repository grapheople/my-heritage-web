import "./env";
import { insertCodex } from "../src/lib/codex-insert";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 한국 아웃도어 브랜드 도감 시드 — **AI 수집이 못 채우는 자리** (D-305).
 *
 * ## ⚠️ 왜 손으로 적는가
 * `db:research-codex` 가 `Kolon Sport`·`K2`·`Nepa` 에서 **일관되게 0건**을 냈다
 * (D-304). 셸·바지, 영문 힌트·한국어 힌트 모두 0 이었다. 모델이 그 브랜드의
 * 제품명을 모르는 것이고, **지어내지 않고 거부한 것이라 동작은 옳다** (D-186).
 *
 * 그런데 **ko 가 1급 언어이고 한국 출시가 먼저다** (D-003, PM 지시 2026-09-06).
 * 한국 유저가 가장 많이 가진 브랜드가 도감에 없으면, 그 유저는 아이템을 등록해도
 * **도감에 연결되지 않는다** — "같은 물건 가진 사람"이 영원히 비어 있다.
 *
 * ## ⚠️ 출처는 브랜드 공식몰과 보도자료다
 * 모델 기억이 아니라 **실제 판매 페이지에서 뽑은 이름**이다 (2026-09-06 조회):
 * - 코오롱스포츠 `kolonsport.com` 고어텍스 자켓 카테고리 · 안타티카 보도자료
 * - 네파 공식몰 `nplus.co.kr` 베스트 목록
 * - K2 보도자료 (알파인 프리즘 고어 자켓 · 트리니티)
 *
 * ## ⚠️ 성별·시즌 접두어를 뗀다
 * 공식몰 표기는 `남성 패스파인더 고어텍스 2L 방수 자켓` 처럼 **성별이 앞에**
 * 붙는데, 도감은 **제품 정체성**이지 SKU 가 아니다 (D-189 가 신발 배색으로
 * 겪은 것과 같은 축). 남녀 공용으로 하나만 둔다.
 *
 * ## ⚠️ 전부 `UNVERIFIED` 다
 * 사람이 실물로 확인한 것이 아니라 판매 페이지에서 읽은 것이다. A-05 검수를
 * 거쳐야 검증 배지가 붙는다 (D-185·D-232 와 같은 기준).
 *
 * ⚠️ **한국 브랜드는 시즌마다 제품명이 바뀐다.** 여기 있는 것은 2026년 시점의
 * 라인업이고, 시즌이 지나면 유저가 가진 옛 모델과 어긋날 수 있다. 그때는
 * A-04 에서 추가한다 — 이 스크립트를 다시 돌려 채우는 구조가 아니다.
 *
 * ```
 * pnpm tsx prisma/seed-korean-outdoor-codex.ts          # 미리보기
 * pnpm tsx prisma/seed-korean-outdoor-codex.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");

type Entry = { brand: string; model: string; subtype: string };

const ENTRIES: Entry[] = [
  // ── 코오롱스포츠 (kolonsport.com · 안타티카 보도자료)
  { brand: "Kolon Sport", model: "안타티카 다운 재킷", subtype: "insulation" },
  { brand: "Kolon Sport", model: "안타티카 오리진 다운 재킷", subtype: "insulation" },
  { brand: "Kolon Sport", model: "안타티카 프리미어 다운 재킷", subtype: "insulation" },
  { brand: "Kolon Sport", model: "HERO 3L 고어텍스 AIRPATH 재킷", subtype: "shell" },
  { brand: "Kolon Sport", model: "HERO 고어텍스 PRO 3L 재킷", subtype: "shell" },
  { brand: "Kolon Sport", model: "윈드체이서 고어텍스 후드 방수 재킷", subtype: "shell" },
  { brand: "Kolon Sport", model: "WM STORM-S 고어 재킷", subtype: "shell" },

  // ── 네파 (nplus.co.kr 베스트 · 제품 검색)
  { brand: "Nepa", model: "패스파인더 고어텍스 2L 방수 자켓", subtype: "shell" },
  { brand: "Nepa", model: "제논 고어텍스 자켓", subtype: "shell" },
  { brand: "Nepa", model: "벨로스터 고어텍스 인피니움 방풍 자켓", subtype: "shell" },
  { brand: "Nepa", model: "알테라 2L 윈드스토퍼 방풍 자켓", subtype: "shell" },
  { brand: "Nepa", model: "그래마 패커블 방풍 자켓", subtype: "shell" },
  { brand: "Nepa", model: "마운틴 매버릭 방풍 자켓", subtype: "shell" },
  { brand: "Nepa", model: "메테오 에코 인피니움 방풍 자켓", subtype: "shell" },
  { brand: "Nepa", model: "에어써밋 경량 다운 자켓", subtype: "insulation" },
  { brand: "Nepa", model: "써모퍼프 패딩 후디 자켓", subtype: "insulation" },
  { brand: "Nepa", model: "써모퍼프 리버서블 패딩 자켓", subtype: "insulation" },
  { brand: "Nepa", model: "경량 튜브 다운 자켓", subtype: "insulation" },
  { brand: "Nepa", model: "프리미아 벨티드 미드 다운 자켓", subtype: "insulation" },
  // ⚠️ `칸네토`·`리웨이` 는 **신발 라인**이다 — 미드/로우 는 컷 높이다
  { brand: "Nepa", model: "칸네토 트랙션 맥스 고어텍스", subtype: "footwear" },
  { brand: "Nepa", model: "칸네토 트랙션 맥스 엑스퍼트 고어텍스", subtype: "footwear" },
  { brand: "Nepa", model: "칸네토 맥스 로우 고어텍스", subtype: "footwear" },
  { brand: "Nepa", model: "리웨이 미드 고어텍스", subtype: "footwear" },

  // ── K2 (보도자료 · 공식 판매처)
  { brand: "K2", model: "알파인 프리즘 고어 자켓", subtype: "shell" },
  { brand: "K2", model: "트리니티 고어 다운 자켓", subtype: "insulation" },
  { brand: "K2", model: "플라이하이크 스카이", subtype: "footwear" },
];

async function main() {
  const url = migrationDatabaseUrl();
  console.log(`대상 DB — ${describeDatabase(url)}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const hiking = await prisma.category.findUnique({
    where: { key: "hiking" },
    select: { id: true },
  });
  if (!hiking) throw new Error("등산 카테고리가 없습니다");

  const subs = await prisma.categorySubtype.findMany({
    where: { categoryId: hiking.id },
    select: { id: true, key: true, labelKo: true },
  });
  const subId = new Map(subs.map((s) => [s.key, s.id]));
  for (const e of ENTRIES) {
    if (!subId.has(e.subtype)) throw new Error(`등산 종류 '${e.subtype}' 가 없습니다`);
  }

  // ⚠️ 브랜드가 마스터에 있고 등산에 붙어 있어야 한다 (D-044) — 없으면 게이트가 막는다
  const brandNames = [...new Set(ENTRIES.map((e) => e.brand))];
  const brands = await prisma.brand.findMany({
    where: { name: { in: brandNames } },
    select: { name: true, scopes: { select: { categoryId: true } } },
  });
  for (const name of brandNames) {
    const b = brands.find((x) => x.name === name);
    if (!b) throw new Error(`브랜드 '${name}' 가 마스터에 없습니다`);
    if (!b.scopes.some((s) => s.categoryId === hiking.id)) {
      throw new Error(`브랜드 '${name}' 가 등산에 연결되어 있지 않습니다`);
    }
  }
  console.log(`브랜드 ${brandNames.length}개 확인 — ${brandNames.join(" · ")}\n`);

  const byType = new Map<string, number>();
  for (const e of ENTRIES) byType.set(e.subtype, (byType.get(e.subtype) ?? 0) + 1);
  for (const [k, n] of byType) {
    const label = subs.find((s) => s.key === k)?.labelKo ?? k;
    console.log(`  ${label} ${n}건`);
  }

  if (!APPLY) {
    console.log(`\n총 ${ENTRIES.length}건 등록 예정 (전부 미검증)`);
    return;
  }

  let created = 0;
  let dup = 0;
  const failed: string[] = [];
  for (const e of ENTRIES) {
    const res = await insertCodex({
      categoryKey: "hiking",
      subtypeId: subId.get(e.subtype)!,
      displayName: `${e.brand} ${e.model}`,
      // 등산 매칭 키는 [brand, model] 이다
      keyValues: { brand: e.brand, model: e.model },
      // ⚠️ 판매 페이지에서 읽은 것이지 실물 확인이 아니다 — A-05 검수 대기
      verification: "UNVERIFIED",
      actorId: "korean-outdoor-seed",
    });
    if (res.ok) created++;
    else if (res.error.startsWith("이미 있는 도감")) dup++;
    else failed.push(`${e.brand} ${e.model} — ${res.error}`);
  }

  console.log(`\n등록 ${created}건 · 중복 ${dup}건 · 실패 ${failed.length}건`);
  for (const f of failed) console.log(`   ✗ ${f}`);

  const total = await prisma.codexItem.count({ where: { categoryId: hiking.id } });
  console.log(`현재 등산 도감 ${total}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
