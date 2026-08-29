import { AdminActionButton } from "@/components/admin/action-button";
import { AttributeAttach } from "@/components/admin/attribute-attach";
import { AttributeCreateForm } from "@/components/admin/attribute-create-form";
import { AttributeOptions } from "@/components/admin/attribute-options";
import { SubtypeAttributes } from "@/components/admin/subtype-attributes";
import { Pill, Table, Td } from "@/components/admin/ui";
import { setCategoryAttribute } from "@/lib/actions/admin";
import { adminCategoryOptions } from "@/lib/admin-categories";
import {
  getAdminAttributeOptions,
  getAdminCategoryAttributes,
  getAdminSubtypeAttributes,
  getAdminSubtypes,
  getUnattachedAttributes,
} from "@/lib/data/admin";

const TYPE_LABEL: Record<string, string> = {
  text: "한 줄", textarea: "여러 줄", number: "숫자", select: "단일 선택",
  multiselect: "다중 선택", date: "날짜", boolean: "토글", url: "URL",
};

/**
 * 카테고리 상세 — 동적 속성 (A-02 흡수, item-catalog F-02 · D-038 · D-246).
 *
 * ⚠️ **삭제가 없다. 비활성화만 있다** (D-036). 사용 중인 속성을 삭제하면 이미
 * 입력된 값이 사라진다. 비활성화하면 신규 입력만 막히고 **값은 보존**된다.
 *
 * ⚠️ **필수 개수에 상한이 없다** (D-039). 12개를 필수로 걸 수도 있고 그러면
 * 등록 완주율이 떨어진다 — 지표로 관측할 뿐 시스템이 막지 않는다.
 *
 * ## 3개 언어 입력이 필요한 곳
 * 속성**명** · `number` **단위** · `select`/`multiselect` **선택지**.
 * 어드민 UI 는 ko 단일이지만 **이 값들은 유저에게 보인다** (D-010, D-030).
 */
export default async function CategoryAttributesPage({
  params,
}: PageProps<"/admin/categories/[key]/attributes">) {
  const { key } = await params;
  const [scoped, subtypes, optionGroups, categories, candidates] = await Promise.all([
    getAdminCategoryAttributes(key),
    getAdminSubtypes(),
    getAdminAttributeOptions(),
    adminCategoryOptions(),
    getUnattachedAttributes(key),
  ]);
  const attrs = scoped[0]?.attrs ?? [];

  /*
    D-207 — 이 카테고리의 제품군과 각각의 전용 속성.
    `getAdminCategoryAttributes` 는 제품군 행을 내지 않는다 (categoryId 가 null)
  */
  const mine = subtypes.filter((s) => s.categoryKey === key);
  const subtypeRows = await Promise.all(
    mine.map(async (s) => ({ ...s, attrs: await getAdminSubtypeAttributes(s.id) })),
  );

  /*
    제품군에 붙일 수 있는 속성 후보 (D-252).

    ## ⚠️ 종전에는 **카테고리 공통 표**를 그대로 후보로 줬다 — 정확히 반대였다
    공통은 이미 그 종류에도 나오므로 **붙이면 폼에 두 번 그려지고**, 정작
    `rimDepth` 같은 **종류 전용 정의는 후보에 없어서 붙일 수가 없었다.**
    자전거는 11개 후보가 전부 공통이었다 — 하나도 붙이면 안 되는 것들이다.

    올바른 후보 = 전체 정의 − 이 카테고리 공통 − 그 종류가 이미 가진 것.
    앞의 뺄셈은 `getUnattachedAttributes`(D-250)가 이미 해준다 — 새 쿼리가 없다.
  */
  const subtypeCandidatePool = candidates.map((c) => ({ key: c.key, label: c.label }));

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          삭제는 없고 비활성화만 됩니다 (D-036). 필수 개수에 상한이 없습니다 (D-039).
        </p>
        <AttributeCreateForm />
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
                    categoryKey: key, attributeKey: a.key, active: !a.active,
                  })}
                />
                <AdminActionButton
                  label={a.required ? "선택으로" : "필수로"}
                  action={setCategoryAttribute.bind(null, {
                    categoryKey: key, attributeKey: a.key, required: !a.required,
                  })}
                />
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      {/*
        D-250 — 만들어도 안 붙던 구멍. `createAttributeDefinition` 은 정의만
        만들고 `CategoryAttribute` 행은 만들지 않는데, 붙이는 컨트롤이 없어서
        "추가한 뒤 카테고리에 붙여야 한다"는 안내문이 **없는 기능을 가리키고
        있었다**
      */}
      <section className="mt-6 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-bold">이 카테고리에 없는 속성 붙이기</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          공통 속성 라이브러리(D-010)에 있지만 이 카테고리에 붙지 않은 속성입니다.
          붙이면 <b>선택 속성</b>으로 들어갑니다 — 필수는 위 표에서 따로 켭니다 (D-039).
        </p>
        <AttributeAttach categoryKey={key} candidates={candidates} />
      </section>

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
            <br />
            ⚠️ <b>공통에 이미 있는 속성은 종류에 붙일 수 없습니다</b> — 붙이면 등록 폼에 같은
            칸이 두 번 나옵니다 (D-252). 종류마다 필수 여부를 다르게 하려면 공통에서 떼고
            종류별로 각각 붙이세요.
          </p>
          <div className="flex flex-col gap-4">
            {subtypeRows.map((s) => (
              <SubtypeAttributes
                key={s.id}
                subtypeId={s.id}
                label={s.labels.ko}
                active={s.active}
                attrs={s.attrs}
                // 컴포넌트가 이 종류의 기존 속성을 다시 걸러낸다
                candidates={subtypeCandidatePool}
              />
            ))}
          </div>
        </section>
      )}

      {/*
        선택지 관리 (D-209, OI-100 해소). ⚠️ 노출 범위가 이 화면의 핵심이다 —
        시계의 `여분 링크`가 캠핑 텐트 폼에 뜨던 것이 여기가 필요해진 이유다
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
    </>
  );
}
