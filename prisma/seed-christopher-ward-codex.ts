import "./env";
import { insertCodex } from "../src/lib/codex-insert";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 크리스토퍼 워드 시계 도감 시드 — **AI 수집이 0건을 낸 자리** (D-311).
 *
 * ## ⚠️ 왜 손으로 적는가
 * `pnpm db:research-codex watch 10 "Christopher Ward"` 가 **후보 0건**을 냈다.
 * 이 브랜드의 모델 코드는 `C60-40ADA31S0KK1-B1` 처럼 길고 **케이스 크기·다이얼·
 * 스트랩이 전부 코드 안에** 있어서, 모델이 자리수를 확신하지 못하고 전부 버렸다.
 * **지어내지 않고 거부한 것이라 동작은 옳다** (D-186). D-305 가 한국 아웃도어
 * 브랜드에서 겪은 것과 **같은 자리**다.
 *
 * ## ⚠️ 출처는 판매 페이지다 (2026-09-07 조회)
 * 모델 기억이 아니라 실제 제품 페이지에서 읽은 코드다:
 * - `christopherward.com` 제품 URL — 주소 자체에 모델 코드가 들어 있다
 * - `coveted.com` 크리스토퍼 워드 목록 (모델명·코드·케이스 크기·다이얼 색)
 *
 * ## ⚠️ 코드가 **변형 단위**라 이름에 크기·색을 넣는다
 * `C60-40ADA31S0KK1` 은 40mm 블랙이고 38mm 블랙은 다른 코드다. 매칭 키가
 * 그것을 구분하므로 **명칭에도 구분이 보여야 한다** (도감 조사 프롬프트 규칙 4 —
 * 안 넣으면 같은 이름의 항목이 여러 개 생겨 유저가 고를 수 없다).
 *
 * ## ⚠️ 스트랩 변형은 **하나로 접었다**
 * 같은 시계가 브레이슬릿·러버·가죽마다 코드가 다르다(`…-B0` / `…-RO` / `…-VK`).
 * 전부 넣으면 **이름이 같은 도감이 3개**가 되어 유저가 무엇을 고를지 모른다.
 * 라인·크기·다이얼 조합마다 **출처에서 읽은 코드 하나**만 둔다.
 *
 * ⚠️ 그래서 **다른 스트랩을 가진 유저는 자기 코드로 등록하면 새 도감이 생긴다.**
 * 그때는 A-06 병합(D-016) 또는 키 alias(D-192)로 붙인다 — 코드를 손으로 잘라
 * "모델 단위 번호"를 만들지 않는다. 제조사가 준 값이 아닌 식별자는 금지다.
 *
 * ## ⚠️ 전부 `UNVERIFIED` 다
 * 판매 페이지에서 읽은 것이지 실물 확인이 아니다. A-05 검수를 거쳐야 검증
 * 배지가 붙는다 (D-185·D-305 와 같은 기준).
 *
 * ```
 * pnpm tsx prisma/seed-christopher-ward-codex.ts          # 미리보기
 * pnpm tsx prisma/seed-christopher-ward-codex.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");

/** 시계 매칭 키는 `uniqueId` 하나다 (A-03 기준, D-013) */
type Entry = { name: string; ref: string };

const BRAND = "Christopher Ward";

const ENTRIES: Entry[] = [
  // ── C60 Trident Pro 300 (다이버, Sellita SW200-1 · 38/40/42mm)
  { name: "C60 Trident Pro 300 38mm Black", ref: "C60-38ADA31S0KK1-B0" },
  { name: "C60 Trident Pro 300 38mm White", ref: "C60-38ADA31S0KW0-HKO" },
  { name: "C60 Trident Pro 300 40mm Black", ref: "C60-40ADA31S0KK1-B1" },
  { name: "C60 Trident Pro 300 40mm Blue", ref: "C60-40ADA31S0BB1-B0" },
  { name: "C60 Trident Pro 300 40mm White", ref: "C60-40ADA31S0KW1-B0" },
  { name: "C60 Trident Pro 300 42mm White", ref: "C60-42ADA31S0KW1-B0" },
  { name: "C60 Trident GMT 300 40mm White", ref: "C60-40AGM31S0BW0-B1" },
  { name: "C60 Trident 41mm Blue Titanium", ref: "C60-41C3H31T0BB0-B0" },

  // ── C63 Sealander (스포츠-익스플로러 · 36/39/40mm)
  { name: "C63 Sealander 36mm Black", ref: "C63-36ADA3-S00K1-B0" },
  { name: "C63 Sealander 36mm White", ref: "C63-36ADA3-S00W0-B0" },
  { name: "C63 Sealander 36mm Dragonfly Blue", ref: "C63-36ADA3-S00B4-B1" },
  { name: "C63 Sealander 36mm Morpho Blue", ref: "C63-36ADA3-S00B9-B0" },
  { name: "C63 Sealander GMT 36mm White", ref: "C63-36AGM3-S00W0-B0" },
  { name: "C63 Sealander GMT 36mm Dragonfly Blue", ref: "C63-36AGM3-S00B4-B1" },
  { name: "C63 Sealander 39mm Black", ref: "C63-39ADA3-S00K2-B0" },
  { name: "C63 Sealander 39mm White", ref: "C63-39ADA3-S00W2-B0" },
  { name: "C63 Sealander GMT 39mm Black", ref: "C63-39AGM3-S00K2-B0" },
  { name: "C63 Sealander Valour 39mm Black", ref: "C63-39QCC3-S00K0-B1" },
  { name: "C63 Sealander 40mm Black Titanium", ref: "C63-40ADA3-T00K1-B0" },

  // ── C12 The Twelve (인테그레이티드 브레이슬릿 · 36/40/41mm)
  { name: "C12 The Twelve 36mm Frosted Lichen", ref: "C12-36A3H1-S00V0-B0" },
  { name: "C12 The Twelve 36mm Alta White", ref: "C12-36A3H1-S00W0-B0" },
  { name: "C12 The Twelve 36mm Lagoon Blue Titanium", ref: "C12-36AHC1-T00B0-B0" },
  { name: "C12 The Twelve 36mm Nardus Green Titanium", ref: "C12-36AHC1-T00V0-B0" },
  { name: "C12 The Twelve 40mm Arctic White", ref: "C12-40ADA1-S00W0-B0" },
  { name: "C12 The Twelve 40mm Astral Blue Titanium", ref: "C12-40ADC1-T00B0-B0" },
  { name: "C12 The Twelve 40mm Aurora Green Titanium", ref: "C12-40ADC1-T00V0-B0" },
  { name: "C12 The Twelve 41mm Black", ref: "C12-41A5D1-T00K0-B0" },
  /*
    The Dial Artist(Chris Alexander) 협업 **150개 한정** — 무브먼트 부품 8개를
    손으로 칠해 **개체마다 다르다.** 그래도 도감은 한 칸이다: 도감은 제품 원형이고
    개체차는 유저 아이템 쪽 이야기다 (D-005). 41mm Grade 2·5 티타늄 · CW-001.
    출처 — christopherward.com 제품 URL · minutesandbeyond.com 리뷰 (2026-09-08 조회)
  */
  { name: "C12 The Twelve Xander 41mm Titanium", ref: "C12-41A5D1-THPDA-B0" },

  // ── C1 Bel Canto (차임 · 37/40.5/41mm)
  { name: "C1 Bel Canto 37mm Midnight Blue", ref: "C01-37AMP2-S00B0-B1" },
  { name: "C1 Bel Canto 40.5mm Black", ref: "C01-40AMP2-S00K0-VK" },
  { name: "C1 Bel Canto 41mm Azzurro Titanium", ref: "C01-41APT3-T00B0-MG" },
  { name: "C1 Bel Canto 41mm Verde Titanium", ref: "C01-41APT3-T00V0-MC" },
  { name: "C1 Bel Canto 41mm Viola Titanium", ref: "C01-41APT0-T00P0-B0" },

  // ── C65 Super Compressor (41mm)
  { name: "C65 Super Compressor 41mm Ocean Blue", ref: "C65-41ASC1-S0WB1-RLB" },
];

async function main() {
  const url = migrationDatabaseUrl();
  // ⚠️ 비밀번호를 출력하지 않는다 (D-116)
  console.log(`대상 DB — ${describeDatabase(url)}`);

  /*
    ⚠️ **브랜드가 마스터에 없으면 멈춘다.** 도감은 브랜드로 걸러 보는 화면이
    있고(D-310 종류·브랜드 필터), 브랜드 추정은 **명칭 앞부분**을 마스터와
    맞춰본다 (D-289). 마스터에 없으면 만들어 넣어도 **아무 필터에도 안 걸린다.**
  */
  const brand = await prisma.brand.findUnique({
    where: { name: BRAND },
    select: { active: true, scopes: { select: { category: { select: { key: true } } } } },
  });
  if (!brand?.active || !brand.scopes.some((s) => s.category.key === "watch")) {
    console.log(`✗ 브랜드 마스터에 활성 '${BRAND}'(시계)가 없습니다 — A-11 에서 먼저 등록하세요`);
    return;
  }

  // 중복 코드가 목록 안에 있으면 먼저 잡는다 — DB 가 막아주지만 의도를 드러낸다
  const dupRef = ENTRIES.map((e) => e.ref).filter((r, i, a) => a.indexOf(r) !== i);
  if (dupRef.length > 0) {
    console.log(`✗ 목록 안에 중복 코드: ${[...new Set(dupRef)].join(", ")}`);
    return;
  }

  const byLine = new Map<string, number>();
  for (const e of ENTRIES) {
    const line = e.name.split(" ")[0];
    byLine.set(line, (byLine.get(line) ?? 0) + 1);
  }
  for (const [line, n] of byLine) console.log(`  ${line} ${n}건`);

  if (!APPLY) {
    console.log(`\n총 ${ENTRIES.length}건 등록 예정 (전부 미검증)`);
    for (const e of ENTRIES) console.log(`   ${BRAND} ${e.name} · ${e.ref}`);
    return;
  }

  let created = 0;
  let dup = 0;
  const failed: string[] = [];
  for (const e of ENTRIES) {
    const res = await insertCodex({
      categoryKey: "watch",
      // 시계는 종류가 없다 — 카테고리 스코프가 정상이다 (D-253)
      subtypeId: null,
      displayName: `${BRAND} ${e.name}`,
      keyValues: { uniqueId: e.ref },
      // ⚠️ 판매 페이지에서 읽은 것이지 실물 확인이 아니다 — A-05 검수 대기
      verification: "UNVERIFIED",
      actorId: "christopher-ward-seed",
    });
    if (res.ok) created++;
    else if (res.error.startsWith("이미 있는 도감")) dup++;
    else failed.push(`${e.name} — ${res.error}`);
  }

  console.log(`\n등록 ${created}건 · 중복 ${dup}건 · 실패 ${failed.length}건`);
  for (const f of failed) console.log(`   ✗ ${f}`);

  const total = await prisma.codexItem.count({ where: { category: { key: "watch" } } });
  console.log(`현재 시계 도감 ${total}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
