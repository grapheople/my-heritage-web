import Link from "next/link";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { AttributeCreateForm } from "@/components/admin/attribute-create-form";
import { setCategoryAttribute } from "@/lib/actions/admin";
import { adminCategoryOptions } from "@/lib/admin-categories";
import {
  getAdminAttributeOptions,
  getAdminCategoryAttributes,
  getAdminSubtypeAttributes,
  getAdminSubtypes,
} from "@/lib/data/admin";
import { SubtypeAttributes } from "@/components/admin/subtype-attributes";
import { AttributeOptions } from "@/components/admin/attribute-options";

const TYPE_LABEL: Record<string, string> = {
  text: "한 줄", textarea: "여러 줄", number: "숫자", select: "단일 선택",
  multiselect: "다중 선택", date: "날짜", boolean: "토글", url: "URL",
};

/**
 * A-02 동적 속성 관리 (item-catalog F-02, D-038).
 *
 * ⚠️ **삭제가 없다. 비활성화만 있다** (D-036, FR-02-A-xx).
 * 사용 중인 속성을 삭제하면 이미 입력된 값이 사라진다. 비활성화하면 신규
 * 입력만 막히고 **값은 보존**된다.
 *
 * ⚠️ **필수 개수에 상한이 없다** (D-039). 운영자가 12개를 필수로 걸 수도 있고,
 * 그러면 등록 완주율이 떨어진다 — 지표로 관측할 뿐 시스템이 막지 않는다.
 *
 * ## 3개 언어 입력이 필요한 곳
 * 속성**명** · `number` **단위** · `select`/`multiselect` **선택지**.
 * 어드민 UI 는 ko 단일이지만 **이 값들은 유저에게 보인다** (D-010, D-030).
 */
export default async function AdminAttributesPage({
  searchParams,
}: PageProps<"/admin/attributes">) {
  const [all, categories, subtypes] = await Promise.all([
    getAdminCategoryAttributes(),
    adminCategoryOptions(),
    getAdminSubtypes(),
  ]);
  const optionGroups = await getAdminAttributeOptions();
  /*
    ⚠️ **라벨 맵을 화면마다 만들지 않는다.** 같은 함정을 네 번 만났다 —
    D-173(A-01 이 운동을 빈칸으로) · D-182(A-11 이 전 브랜드를 "시계"로) ·
    D-185(도감 화면 두 곳이 `workout` 을 그대로 렌더) · 그리고 이 화면의
    A-03 은 **운동이 아예 목록에 없었다**. `adminCategoryOptions()` 하나만 쓴다
  */
  const label = new Map(categories.map((c) => [c.key, c.label]));
  const sp = await searchParams;
  // 카테고리 전환은 링크로 한다 — 클라이언트 상태를 둘 이유가 없다
  const slug = typeof sp.category === "string" ? sp.category : (all[0]?.slug ?? "");
  const current = all.find((c) => c.slug === slug) ?? all[0];
  const attrs = current?.attrs ?? [];

  /*
    D-207 — 현재 카테고리의 제품군과 각각의 전용 속성.
    `getAdminCategoryAttributes` 는 제품군 행을 내지 않는다 (categoryId 가 null)
  */
  const mine = subtypes.filter((s) => s.categoryKey === current?.slug);
  const subtypeRows = await Promise.all(
    mine.map(async (s) => ({ ...s, attrs: await getAdminSubtypeAttributes(s.id) })),
  );
  /** 제품군에 붙일 수 있는 속성 후보 — 공통 표에 있는 정의를 그대로 쓴다 */
  const allDefs = attrs.map((a) => ({ key: a.key, label: a.label }));
  return (
    <AdminPage
      id="A-02" title="동적 속성 관리"
      desc="카테고리별 속성 8종. 삭제는 없고 비활성화만 됩니다 (D-036)."
      action={
        <AttributeCreateForm />
      }
    >
      <div className="mb-4 flex gap-2">
        {all.map((c) => (
          <Link
            key={c.slug}
            href={`/admin/attributes?category=${c.slug}`}
            className={
              c.slug === current?.slug
                ? "rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm font-semibold text-background"
                : "rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {label.get(c.slug) ?? c.slug}
          </Link>
        ))}
      </div>

      <Table head={["순서", "속성명 (ko)", "key", "타입", "필수", "매칭 키", "조치"]}>
        {attrs.map((a, i) => (
          <tr key={a.key}>
            <Td>{i + 1}</Td>
            <Td className="font-semibold">{a.label}</Td>
            <Td className="font-mono text-xs">{a.key}</Td>
            <Td>{TYPE_LABEL[a.type]}</Td>
            <Td>{a.required ? <Pill tone="warn">필수</Pill> : "—"}</Td>
            <Td>{a.matchingKey ? <Pill tone="sale">매칭 키</Pill> : "—"}</Td>
            <Td>
              <span className="flex items-start gap-2 whitespace-nowrap">
                <AdminActionButton
                  label={a.active ? "비활성화" : "활성화"}
                  // 값은 보존되고 표시에서만 빠진다 (D-036, M-09)
                  confirm={a.active ? "기존 값은 보존되고 표시에서만 빠집니다." : undefined}
                  action={setCategoryAttribute.bind(null, {
                    categoryKey: current?.slug ?? "",
                    attributeKey: a.key,
                    active: !a.active,
                  })}
                />
                <AdminActionButton
                  label={a.required ? "선택으로" : "필수로"}
                  action={setCategoryAttribute.bind(null, {
                    categoryKey: current?.slug ?? "",
                    attributeKey: a.key,
                    required: !a.required,
                  })}
                />
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      {/*
        D-207 — 이 카테고리의 제품군 전용 속성. **공통 표에는 안 나온다** —
        제품군 행은 `categoryId` 가 `null` 이라(카테고리 XOR 제품군) 위 조회에
        걸리지 않는다. 등록 폼은 **공통 + 선택된 제품군**을 합쳐 그린다
      */}
      {subtypeRows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold">하위 종류 전용 속성</h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            위 공통 속성에 <b>더해서</b> 나옵니다. 종류를 고르지 않으면 공통만 나옵니다.
          </p>
          <div className="flex flex-col gap-4">
            {subtypeRows.map((s) => (
              <SubtypeAttributes
                key={s.id}
                subtypeId={s.id}
                label={s.labels.ko}
                active={s.active}
                attrs={s.attrs}
                candidates={allDefs}
              />
            ))}
          </div>
        </section>
      )}

      {/*
        선택지 관리 (D-209, OI-100 해소). **여기 있던 것은 목업이었다** —
        입력칸만 그려져 있고 서버 액션이 없어서 선택지 추가·스코프 변경이
        **시드 스크립트로만** 가능했다.

        ⚠️ 노출 범위가 이 화면의 핵심이다 — 시계의 `여분 링크`가 캠핑 텐트
        폼에 뜨던 것(D-209)이 여기가 필요해진 이유다.
      */}
      <section className="mt-8">
        <h2 className="text-sm font-bold">선택지 관리 (select · multiselect)</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          ⚠️ <b>선택지 번역 누락이 가장 흔합니다</b> (`policies/i18n` §3). 속성명만
          번역하고 선택지를 빼면 <b>일본어 화면에 한국어 옵션이 섞입니다.</b>
          <br />
          공통 속성이라도 <b>선택지는 카테고리마다 다를 수 있습니다</b> — 노출 범위로
          가립니다 (D-209).
        </p>
        <AttributeOptions groups={optionGroups} categories={categories} />
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        필수 속성 개수에 상한이 없습니다 (D-039). 12개를 필수로 걸 수도 있고,
        그러면 등록 완주율이 떨어집니다 — 지표로 관측합니다.
      </p>
    </AdminPage>
  );
}
