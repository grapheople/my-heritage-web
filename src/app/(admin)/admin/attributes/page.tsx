import Link from "next/link";
import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { setCategoryAttribute } from "@/lib/actions/admin";
import { getAdminCategoryAttributes } from "@/lib/data/admin";

const CAT_LABEL: Record<string, string> = {
  watch: "시계", shoes: "신발", bicycle: "자전거",
  apparel: "옷", camping: "캠핑", deskterior: "데스크테리어",
};

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
  const all = await getAdminCategoryAttributes();
  const sp = await searchParams;
  // 카테고리 전환은 링크로 한다 — 클라이언트 상태를 둘 이유가 없다
  const slug = typeof sp.category === "string" ? sp.category : (all[0]?.slug ?? "");
  const current = all.find((c) => c.slug === slug) ?? all[0];
  const attrs = current?.attrs ?? [];
  return (
    <AdminPage
      id="A-02" title="동적 속성 관리"
      desc="카테고리별 속성 8종. 삭제는 없고 비활성화만 됩니다 (D-036)."
      action={
        <button disabled title="편집 폼 미구현 (OI-64)" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground opacity-40">
          속성 추가
        </button>
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
            {CAT_LABEL[c.slug] ?? c.slug}
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

      {/* ⚠️ 유저 노출 필드는 3개 언어 (D-010·D-030) */}
      <section className="mt-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">속성 추가 · 편집</h2>
        <div className="mt-4 flex flex-col gap-4">
          <TriLingualField label="속성명" name="label" required
            values={{ ko: "무브먼트", ja: "ムーブメント", en: "Movement" }} />
          <TriLingualField label="단위 (number 타입)" name="unit"
            values={{ ko: "mm", ja: "mm", en: "mm" }} />
          <TriLingualField label="선택지 1 (select·multiselect)" name="opt1"
            values={{ ko: "오토", ja: "オート", en: "Automatic" }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          ⚠️ 선택지 번역 누락이 가장 흔합니다. 속성명만 번역하고 선택지를 빼면
          일본어 화면에 한국어 옵션이 섞입니다.
        </p>
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        필수 속성 개수에 상한이 없습니다 (D-039). 12개를 필수로 걸 수도 있고,
        그러면 등록 완주율이 떨어집니다 — 지표로 관측합니다.
      </p>
    </AdminPage>
  );
}
