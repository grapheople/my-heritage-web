import { redirect } from "next/navigation";

/**
 * A-02 동적 속성 관리는 **카테고리 상세 `동적 속성` 탭으로 흡수됐다** (D-246).
 * → `/admin/categories/[key]/attributes`
 *
 * ## ⚠️ 삭제하지 않고 redirect 로 남긴다 (D-249)
 * 기획 문서·북마크·과거 커밋 메시지가 이 경로를 가리킨다. 지우면 404 만
 * 남고 **어디로 가야 하는지 알 수 없다.**
 *
 * ## ⚠️ A-02 번호는 회수하되 재사용하지 않는다 (D-220)
 * 번호를 재사용하면 문서·화면·로그가 서로 다른 것을 가리킨다.
 *
 * 카테고리를 특정할 수 없으므로 목록으로 보낸다 — 어느 카테고리의 속성을
 * 보려던 것인지는 이 경로에 남아 있지 않다.
 */
export default function AdminAttributesRedirect() {
  redirect("/admin/categories");
}
