import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/ui";
import { BotConsole } from "@/components/admin/bot-console";
import { botEnabled, botTargetDb, claudeConfigured } from "@/lib/bot/guard";
import { getAdminCategories } from "@/lib/data/admin";
import { getBots } from "@/lib/data/admin";

/**
 * A-15 봇 콘텐츠 시딩 (D-146).
 *
 * ## ⚠️ 로컬 개발 환경에서만 존재한다
 * 프로덕션에서는 **404** 다 — 화면 자체를 내보내지 않는다. 봇은 실제 유저
 * 콘텐츠를 만들기 때문에, 프로덕션에서 누를 수 있으면 누군가 누른다.
 *
 * ## ⚠️ 대상 DB 를 화면에 띄운다
 * 로컬 런타임은 **Supabase(프로덕션 DB)** 를 본다 (D-117). "로컬에서 돌린다"가
 * "안전하다"를 뜻하지 않는다 — D-116 에서 어디에 쓰는지 보이지 않는 쓰기가
 * 사고의 본질이었다.
 */
export default async function AdminBotsPage() {
  if (!botEnabled()) notFound();

  const [bots, categories] = await Promise.all([getBots(), getAdminCategories()]);

  return (
    <AdminPage
      id="A-15"
      title="봇 콘텐츠 시딩"
      desc="로컬 개발 환경 전용입니다. 봇이 만든 콘텐츠는 일반 유저 콘텐츠와 같은 경로로 저장됩니다."
    >
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <p>
          <b>대상 DB — {botTargetDb()}</b>
        </p>
        <p className="mt-1">
          ⚠️ 로컬에서 실행하지만 <b>여기 적힌 DB 에 실제로 저장됩니다.</b>{" "}
          원격이면 서비스에 그대로 노출됩니다.
        </p>
        {!claudeConfigured() && (
          <p className="mt-1">
            ⚠️ <code>ANTHROPIC_API_KEY</code> 가 없어 <b>글 생성이 동작하지 않습니다.</b>{" "}
            봇 생성과 아이템 등록은 가능합니다(별칭 없이).
          </p>
        )}
      </div>

      <BotConsole
        bots={bots}
        categories={categories.map((c) => ({
          key: c.slug,
          label: c.labelKey.replace("category.", ""),
        }))}
      />
    </AdminPage>
  );
}
