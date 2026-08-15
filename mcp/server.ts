import "../prisma/env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { normalizeBrandToken } from "../src/lib/brand-search";
import { CATEGORY_KEYS } from "../src/lib/categories";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import {
  getAdminBrandsPage,
  getAdminCodexPage,
  getCodexKeyAliasCandidates,
  getCodexMergeCandidates,
} from "../src/lib/data/admin";
import { setCodexAliases } from "../src/lib/actions/admin";
import { prisma } from "../src/lib/prisma";

/**
 * 어드민 운영 MCP 서버 (D-201).
 *
 * 어드민이 **자기 Claude 클라이언트**에 붙여 도감·브랜드 운영을 대화로 한다.
 * 273건을 화면에서 하나씩 넘기는 대신 "이 12건이 의심스럽다"로 좁힌다 (OI-95).
 *
 * ## ⚠️ 왜 이것이 D-191 을 어기지 않는가
 * D-191 은 유저 대면 AI 를 폐기했다 — 전 기능 무료(D-024)라 **추론 비용의 회수
 * 경로가 없기** 때문이다. MCP 는 **추론 비용을 우리가 내지 않는다.** 어드민의
 * 구독이 내고 우리는 데이터·도구만 준다. D-191 을 개정하지 않는다.
 *
 * ## ⚠️ 무엇을 노출하지 **않는가**가 이 설계의 본체다
 *
 * | 없음 | 이유 |
 * |---|---|
 * | 검증 배지 부여 | AI 가 `검증됨` 을 달 수 있으면 **배지가 무의미**해진다 (D-185) |
 * | 병합 실행 | 병합은 어드민 수동 실행이다 (D-016). AI 는 후보를 좁히는 데까지 |
 * | 키 alias **승인** | 틀리면 아이템이 엉뚱한 도감에 붙는다 (D-194). **제안만** 한다 |
 * | 아이템·일기·유저·제재 | 유저 콘텐츠에 AI 가 손대지 않는다 (원칙 5) |
 * | 삭제 전반 | 되돌릴 수 없다 |
 *
 * **읽기는 넓게, 쓰기는 좁게.** 판단 재료는 충분히 주고, 쓰기는 되돌릴 수
 * 있거나 승인 게이트가 있는 것만 연다.
 *
 * ## ⚠️ stdio 다 — HTTP 가 아니다
 * HTTP 면 인증 표면이 새로 생긴다(지금은 세션 쿠키뿐이고 API 토큰 체계가 없다).
 * stdio 는 **프로세스를 띄운 사람이 곧 인가**이고, D-146 의 로컬 전용 가드와
 * 같은 성질이다.
 *
 * 실행:
 *   pnpm mcp
 * Claude 클라이언트 설정 예:
 *   { "command": "pnpm", "args": ["--dir", "<repo>", "mcp"] }
 */

/*
  ⚠️ **대상 DB 를 서버 설명에 박는다** (D-116·D-146). 로컬에서 띄워도
  런타임이 Supabase(운영 DB)를 볼 수 있다 (D-117) — "어디에 쓰는지 보이지 않는
  쓰기"가 사고의 본질이었다. 도구 목록을 읽는 순간 어드민이 알아야 한다.

  ⚠️ **`runtimeDatabaseUrl()` 이다 — 마이그레이션 URL 이 아니다.** 쓰기는 `prisma`
  를 지나고 그것은 `DATABASE_URL` 을 쓴다. `DIRECT_URL` 을 표시하면 둘이 다른
  환경에서 **표시와 실제가 어긋난다** (D-202).
*/
const TARGET_DB = describeDatabase(runtimeDatabaseUrl());

const server = new McpServer({
  name: "zroom-admin",
  version: "0.1.0",
});

const categoryEnum = z.enum(CATEGORY_KEYS);

/* ────────────────────────────────────────────
   읽기 — 판단 재료
   ──────────────────────────────────────────── */

server.registerTool(
  "list_codex",
  {
    title: "도감 목록",
    description:
      `도감을 검색·필터해 나열한다 (대상 DB: ${TARGET_DB}). ` +
      "검색은 명칭·고유값·정식 값·명칭 alias·키 alias 를 D-014 정규화로 훑는다 — " +
      "대소문자·공백·하이픈 차이는 흡수된다.",
    inputSchema: {
      q: z.string().optional().describe("검색어. 비우면 전체"),
      category: categoryEnum.optional(),
      unverifiedOnly: z.boolean().optional().describe("미검증만 (A-05 검수 대상)"),
      page: z.number().int().min(1).optional(),
      size: z.number().int().min(1).max(200).optional().describe("기본 50"),
    },
  },
  async ({ q, category, unverifiedOnly, page, size }) => {
    const r = await getAdminCodexPage({ q, category, unverifiedOnly, page, size: size ?? 50 });
    return json({
      total: r.total,
      filtered: r.filtered,
      // ⚠️ 절단을 숨기지 않는다 (D-160)
      truncated: r.total >= r.loadLimit ? `조회 상한 ${r.loadLimit}건에 걸렸다` : undefined,
      rows: r.rows.map((c) => ({
        id: c.id,
        name: c.displayName,
        category: c.categoryLabel,
        uniqueId: c.uniqueId,
        normalizedKey: c.normalizedKey,
        verified: c.verified,
        owners: c.ownerCount,
        nameAliases: c.aliases,
        keyAliases: c.keyAliases.map((k) => ({ value: k.value, source: k.source, active: k.active })),
      })),
    });
  },
);

server.registerTool(
  "codex_stats",
  {
    title: "도감 지표",
    description:
      "카테고리별 도감 수·미검증 비율·도감당 연결 아이템 수, 그리고 등록 매칭 결과 분포. " +
      "미스가 '단위 차이'인지 '도감 부재'인지 가른다 (H11) — 검색으로는 나오는데 등록은 미스인 비율이 단위 차이다.",
    inputSchema: {},
  },
  async () => {
    const cats = await prisma.category.findMany({
      select: { id: true, key: true },
      orderBy: { displayOrder: "asc" },
    });
    const out = [];
    for (const c of cats) {
      const [total, unverified, items, logs, missWithHits] = await Promise.all([
        prisma.codexItem.count({ where: { categoryId: c.id, mergedIntoId: null } }),
        prisma.codexItem.count({
          where: { categoryId: c.id, mergedIntoId: null, verification: "UNVERIFIED" },
        }),
        prisma.item.count({ where: { categoryId: c.id, codexItemId: { not: null } } }),
        prisma.codexMatchLog.groupBy({
          by: ["outcome"],
          where: { categoryId: c.id },
          _count: { _all: true },
        }),
        prisma.codexMatchLog.count({
          where: { categoryId: c.id, outcome: "CREATED", searchHits: { gt: 0 } },
        }),
      ]);
      const by = Object.fromEntries(logs.map((l) => [l.outcome, l._count._all]));
      const attempts = (by.EXACT ?? 0) + (by.KEY_ALIAS ?? 0) + (by.CREATED ?? 0);
      out.push({
        category: c.key,
        codexTotal: total,
        unverified,
        // 1.0 에 가까우면 도감이 연결점 역할을 못 한다 (G3 지표)
        itemsPerCodex: total === 0 ? null : Number((items / total).toFixed(2)),
        match: attempts === 0 ? null : {
          exact: by.EXACT ?? 0,
          keyAlias: by.KEY_ALIAS ?? 0,
          created: by.CREATED ?? 0,
          missRate: Number((((by.CREATED ?? 0) / attempts) * 100).toFixed(1)),
          /* ⚠️ H11 판별자 — 미스인데 검색으로는 나온 비율. 높으면 키 alias 가 답이고
             낮으면 도감 자체가 없는 것이라 시딩량이 답이다 */
          missButSearchable: by.CREATED ? Number(((missWithHits / by.CREATED) * 100).toFixed(1)) : 0,
        },
      });
    }
    return json({ targetDb: TARGET_DB, categories: out });
  },
);

server.registerTool(
  "list_merge_candidates",
  {
    title: "병합 후보",
    description:
      "중복 가능 도감 쌍. 판정은 정규화 기반 3규칙뿐이다(고유값 같음·명칭 같음·접두 일치) — " +
      "유사도 점수는 의도적으로 없다 (D-181: 놓치는 게 잘못 합치는 것보다 싸다). " +
      "⚠️ 병합 실행은 이 서버에 없다. 어드민이 A-06 화면에서 한다.",
    inputSchema: { category: categoryEnum.optional() },
  },
  async ({ category }) => {
    const all = await getCodexMergeCandidates();
    const rows = category ? all.filter((c) => c.categoryKey === category) : all;
    return json({ count: rows.length, rows });
  },
);

server.registerTool(
  "list_key_alias_candidates",
  {
    title: "키 alias 후보",
    description:
      "등록은 미스였는데 같은 값으로 검색하면 도감이 나온 경우 (D-198). " +
      "재료가 AI 가 아니라 유저가 실제로 넣은 값이라 지어낸 값이 아니다. 빈도 순.",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  },
  async ({ limit }) => json(await getCodexKeyAliasCandidates(limit ?? 50)),
);

server.registerTool(
  "list_brands",
  {
    title: "브랜드 마스터",
    description:
      "브랜드를 검색·필터해 나열한다. 검색은 이름 + 3개 언어 alias 를 정규화로 훑는다. " +
      "⚠️ alias 가 비면 그 언어 유저에게는 브랜드가 없는 것으로 보인다 (D-047).",
    inputSchema: {
      q: z.string().optional(),
      category: categoryEnum.optional(),
      missingAliasOnly: z.boolean().optional(),
      page: z.number().int().min(1).optional(),
      size: z.number().int().min(1).max(300).optional(),
    },
  },
  async ({ q, category, missingAliasOnly, page, size }) => {
    const r = await getAdminBrandsPage({ q, category, page, size: size ?? 50 });
    const rows = missingAliasOnly ? r.rows.filter((b) => b.aliases.length === 0) : r.rows;
    return json({
      total: r.total,
      filtered: r.filtered,
      missingAliasTotal: r.missingAliasTotal,
      rows: rows.map((b) => ({
        name: b.name,
        active: b.active,
        categories: b.categoryKeys,
        aliasesByLang: b.aliasesByLang,
      })),
    });
  },
);

/* ────────────────────────────────────────────
   쓰기 — 되돌릴 수 있거나 승인 게이트가 있는 것만
   ──────────────────────────────────────────── */

server.registerTool(
  "set_codex_name_aliases",
  {
    title: "도감 명칭 alias 설정",
    description:
      "검색용 명칭 alias 를 언어별로 덮어쓴다 (D-009). " +
      "⚠️ 이것은 **검색 전용**이라 틀려도 검색이 조금 넓어질 뿐이다 — 그래서 승인 게이트가 없다. " +
      "등록 매칭에 쓰이는 것은 키 alias 이고 그쪽은 제안만 가능하다.",
    inputSchema: {
      codexId: z.string(),
      ko: z.array(z.string()).optional(),
      ja: z.array(z.string()).optional(),
      en: z.array(z.string()).optional(),
    },
  },
  async ({ codexId, ko, ja, en }) => {
    const r = await setCodexAliases(codexId, { ko, ja, en });
    return json(r.ok ? { ok: true } : { ok: false, error: r.formError });
  },
);

server.registerTool(
  "propose_key_alias",
  {
    title: "키 alias 제안 (승인 대기)",
    description:
      "커뮤니티 통용 번호를 정식 값에 흡수시킬 키 alias 를 **제안**한다 (예: 1460 → 11822006). " +
      "⚠️ **승인 전에는 매칭에 쓰이지 않는다** (FR-06-C-05). 어드민이 A-07 화면에서 승인해야 적용된다 — " +
      "키 alias 가 틀리면 유저 아이템이 엉뚱한 도감에 붙기 때문이다 (D-194).",
    inputSchema: {
      codexId: z.string(),
      value: z.string().describe("유저가 넣을 법한 통용 값. 저장 시 D-014 정규화가 적용된다"),
      note: z.string().optional().describe("근거 — 어드민이 승인 판단에 쓴다"),
    },
  },
  async ({ codexId, value, note }) => {
    const codex = await prisma.codexItem.findUnique({
      where: { id: codexId },
      select: { categoryId: true, normalizedKey: true, mergedIntoId: true, displayName: true },
    });
    if (!codex) return json({ ok: false, error: "도감을 찾을 수 없습니다" });
    if (codex.mergedIntoId) return json({ ok: false, error: "병합된 도감입니다 — survivor 에 제안하세요" });

    const normalized = normalizeBrandToken(value);
    if (!normalized) return json({ ok: false, error: "값이 비어 있습니다" });
    if (normalized === codex.normalizedKey) {
      return json({ ok: false, error: "이 도감의 정식 값입니다 — 이미 매칭됩니다" });
    }

    try {
      await prisma.codexMatchKey.create({
        data: {
          categoryId: codex.categoryId,
          codexItemId: codexId,
          value: normalized,
          kind: "ALIAS",
          /* ⚠️ `AI_APPROVED` + `approvedBy: null` = **승인 대기**. 이 조합이 아니면
             매칭에 즉시 반영된다 — AI 가 매칭을 직접 바꾸게 두지 않는다 (D-194) */
          source: "AI_APPROVED",
          approvedBy: null,
        },
      });
    } catch {
      const owner = await prisma.codexMatchKey.findUnique({
        where: { categoryId_value: { categoryId: codex.categoryId, value: normalized } },
        select: { kind: true, codexItem: { select: { displayName: true } } },
      });
      return json({
        ok: false,
        error: owner
          ? `이미 "${owner.codexItem.displayName}" 의 ${owner.kind === "PRIMARY" ? "정식 값" : "키 alias"} 입니다`
          : "저장하지 못했습니다",
      });
    }

    return json({
      ok: true,
      status: "승인 대기",
      codex: codex.displayName,
      normalized,
      note,
      next: "A-07 (/admin/codex/aliases) 에서 어드민이 승인해야 매칭에 반영됩니다",
    });
  },
);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

async function main() {
  /*
    ⚠️ **로컬 전용** (D-146). 프로덕션 런타임에 이 경로가 있으면 누군가 실수로
    운영 데이터를 AI 로 만진다. 봇 가드와 같은 판정을 쓴다.
  */
  if (process.env.NODE_ENV === "production") {
    throw new Error("어드민 MCP 는 로컬 전용입니다 (D-146·D-201)");
  }
  // stdout 은 MCP 프로토콜 채널이다 — 로그를 절대 쓰지 않는다
  console.error(`[zroom-admin mcp] 대상 DB: ${TARGET_DB}`);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
