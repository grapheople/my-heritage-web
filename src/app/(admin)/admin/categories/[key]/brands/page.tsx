import Link from "next/link";
import { AdminActionButton } from "@/components/admin/action-button";
import { BrandAliasEditor } from "@/components/admin/brand-forms";
import { BrandLinkForm } from "@/components/admin/brand-link";
import { AdminListControls } from "@/components/admin/list-controls";
import { Pill, Table, Td } from "@/components/admin/ui";
import { setBrandActive, setBrandCategory } from "@/lib/actions/admin";
import { parseListParams } from "@/lib/admin-list-params";
import {
  getAdminBrandsPage,
  getCategoryBrandItemCounts,
  getUnlinkedBrands,
} from "@/lib/data/admin";

/**
 * 카테고리 상세 — 연결 브랜드 (D-251).
 *
 * ## ⚠️ D-247 의 부분 개정이다
 * D-247 은 "브랜드는 Category 와 N:M 이라 카테고리로 접으면 편집 의미가
 * 깨진다"고 보고 **읽기 전용**으로 뒀다. 그 판단은 **브랜드 마스터 자체**
 * (원문·생성·전 카테고리 현황)에 대해서는 유지된다 — 그건 A-11 이 맡는다.
 *
 * 다만 **"이 카테고리에 무엇이 붙어 있나"는 카테고리의 속성**이다. 연결은
 * `createBrand` 와 요청 승인에서 `connect` 만 했고 **떼는 경로가 없었으므로**,
 * 생성 시점에 잘못 고르면 고칠 자리가 없었다.
 *
 * ## ⚠️ 떼도 기존 아이템은 그대로다
 * `Item.brandId` 는 이 N:M 링크와 **독립된 FK** 다. 떼면 이 카테고리 등록 폼의
 * **브랜드 선택지에서만** 빠지고(D-044), 이미 등록된 아이템의 브랜드 표시는
 * 유지된다 (명칭이 `brand.name + model` 파생인 것도 그대로 — D-073).
 *
 * ## ⚠️ 원문 이름은 수정하지 않는다
 * 1개 고정이고(D-009) unique 키다. **어느 화면에도 이름 편집이 없다.**
 * 여기서 되는 수정은 A-11 과 같은 **alias · 활성 토글**이다.
 */
export default async function CategoryBrandsPage({
  params,
  searchParams,
}: PageProps<"/admin/categories/[key]/brands">) {
  const { key } = await params;
  const listParams = parseListParams(await searchParams);
  const [list, itemCounts, candidates] = await Promise.all([
    // ⚠️ URL 의 카테고리가 이긴다 — 쿼리의 category 는 덮어쓴다
    getAdminBrandsPage({ ...listParams, category: key }),
    getCategoryBrandItemCounts(key),
    getUnlinkedBrands(key),
  ]);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        연결된 브랜드만 이 카테고리 등록 폼의 선택지에 나옵니다 (D-044). 브랜드 원문
        이름은 1개 고정이라 수정하지 않습니다 (D-009) — 여기서는 <b>alias · 활성</b>을
        고치고, 브랜드 추가는{" "}
        <Link href="/admin/brands" className="underline">
          브랜드 마스터 (A-11)
        </Link>
        에서 합니다.
      </p>

      {/* categories 를 넘기지 않는다 — 카테고리는 URL 로 고정됐다 */}
      <AdminListControls
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
        placeholder="브랜드명 · alias 검색"
      />

      <Table head={["브랜드 (원문)", "alias", "이 카테고리 아이템", "상태", "조치"]}>
        {list.rows.map((b) => {
          const used = itemCounts.get(b.id) ?? 0;
          return (
            <tr key={b.id} className={b.active ? "" : "text-muted-foreground"}>
              {/* 원문은 번역하지 않는다 — 1개 고정 (D-009) */}
              <Td className="font-semibold">{b.name}</Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {b.aliases.length === 0 ? (
                    // D-047 — alias 가 없으면 "롤렉스"로 검색해도 안 나온다
                    <Pill tone="warn">alias 없음</Pill>
                  ) : (
                    b.aliases.map((a) => <Pill key={a}>{a}</Pill>)
                  )}
                </span>
              </Td>
              {/* ⚠️ 이 값이 "떼도 되나"의 근거다 (FR-11-A-10 과 같은 이유) */}
              <Td>{used.toLocaleString("en-US")}</Td>
              <Td>{b.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}</Td>
              <Td>
                <span className="flex flex-wrap items-start gap-2">
                  <BrandAliasEditor
                    brandId={b.id}
                    brandName={b.name}
                    initial={b.aliasesByLang}
                  />
                  {/*
                    ⚠️ **삭제가 아니라 비활성화다** (D-036·D-043). 비활성화하면
                    신규 등록 선택지에서만 빠지고 이미 등록된 아이템은 그대로다
                  */}
                  <AdminActionButton
                    label={b.active ? "비활성화" : "활성화"}
                    confirm={
                      b.active
                        ? "신규 등록·브랜드 선택에서 빠집니다. 이미 이 브랜드로 등록된 아이템은 그대로 남습니다."
                        : undefined
                    }
                    action={setBrandActive.bind(null, b.id, !b.active)}
                  />
                  {/*
                    ⚠️ 해제는 **이 카테고리에서만** 뗀다. 브랜드 자체는 남고
                    다른 카테고리 연결도 그대로다 (N:M)
                  */}
                  <AdminActionButton
                    label="연결 해제"
                    confirm={
                      used > 0
                        ? `이 카테고리 등록 폼의 브랜드 선택지에서 빠집니다. 이미 등록된 아이템 ${used}건의 브랜드 표시는 그대로입니다. 되돌릴 수 있어요.`
                        : "이 카테고리 등록 폼의 브랜드 선택지에서 빠집니다. 되돌릴 수 있어요."
                    }
                    action={setBrandCategory.bind(null, {
                      brandId: b.id,
                      categoryKey: key,
                      linked: false,
                    })}
                  />
                </span>
              </Td>
            </tr>
          );
        })}
      </Table>

      <section className="mt-6 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-bold">이 카테고리에 브랜드 연결하기</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          연결하면 이 카테고리 등록 폼의 브랜드 선택지에 나옵니다 (D-044).{" "}
          <b>활성 브랜드만 후보입니다</b> — 비활성은 연결해도 유저에게 안 보입니다
          (D-036).
        </p>
        <BrandLinkForm categoryKey={key} candidates={candidates} />
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        alias 가 없으면 한국 유저가 &ldquo;롤렉스&rdquo;로 검색해도 <b>Rolex</b> 가 나오지
        않아 브랜드가 없는 것으로 오인하고 추가 요청을 보냅니다 (D-047).
      </p>
    </>
  );
}
