"use server";

import { getAdmin } from "@/lib/auth/admin";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { createItemAs } from "@/lib/actions/item";
import { createDiaryAs } from "@/lib/actions/diary";
import { botEnabled } from "@/lib/bot/guard";
import { writeDiaryBody, writeItemNickname } from "@/lib/bot/claude";
import { hashBotPassword, verifyBotPassword } from "@/lib/bot/password";
import { makeBotPhoto } from "@/lib/bot/photo";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/**
 * A-15 봇 계정 — 콘텐츠 시딩 (D-146).
 *
 * ## ⚠️ 모든 액션이 두 겹으로 막힌다
 * 1. **로컬 개발 모드**여야 한다 (`botEnabled`) — 프로덕션에는 이 경로가 없다
 * 2. **어드민이어야 한다** — 로컬 우회로가 열려 있어도 어드민 판정을 거친다
 *
 * ## ⚠️ 봇 콘텐츠도 **일반 경로로** 만든다
 * `createItemAs`·`createDiaryAs` 를 그대로 쓴다. 봇 전용 저장 경로를 만들면
 * 필수 검증(사진 1장·필수 속성·도감 매칭)을 우회하게 되고, **그 구멍으로
 * 나중에 사람도 들어온다.** 경험치·도감 자동 생성도 똑같이 일어난다.
 */
async function guard(): Promise<{ actorId: string } | { error: string }> {
  if (!botEnabled()) {
    return { error: "봇은 로컬 개발 환경에서만 동작합니다 (D-146)" };
  }
  const admin = await getAdmin();
  if (!admin) return { error: "권한이 없습니다" };
  return { actorId: admin.id };
}


/**
 * 실패 이유를 **읽을 수 있게** 만든다 (D-150).
 *
 * ⚠️ **`formError` 에 뭉뜬 문구를 채우면 진짜 이유가 사라진다.** 초판이
 * `fail(fieldErrors, "등록에 실패했습니다")` 였는데, 화면은 `formError` 를
 * 먼저 읽으므로 `{"model":"필수 항목이에요"}` 가 영원히 안 보였다 — 어드민은
 * 무엇을 고쳐야 할지 알 수 없었다.
 *
 * 필드 오류가 있으면 **어느 항목이 왜 막혔는지**를 문장으로 만든다.
 */
function reason(
  res: { formError?: string; fieldErrors: Record<string, string> },
  fallback: string,
): string {
  if (res.formError) return res.formError;
  const parts = Object.entries(res.fieldErrors).map(([k, v]) => `${LABEL[k] ?? k}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : fallback;
}

/** 어드민이 화면에서 보는 이름과 맞춘다 */
const LABEL: Record<string, string> = {
  brand: "브랜드",
  model: "모델명",
  __photos: "사진",
};

/** 봇 생성 — 유저·방·자격증명을 함께 만든다 */
export async function createBot(input: {
  loginId: string;
  password: string;
  roomName: string;
  language: Locale;
}): Promise<ActionResult<{ botId: string }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const loginId = input.loginId.trim().toLowerCase();
  const roomName = input.roomName.trim();
  if (!loginId) return fail({ loginId: "아이디를 입력해주세요" });
  if (input.password.length < 8) {
    return fail({ password: "8자 이상이어야 합니다" });
  }
  if (!roomName) return fail({ roomName: "방 이름을 입력해주세요" });

  const dup = await prisma.botAccount.findUnique({
    where: { loginId },
    select: { id: true },
  });
  if (dup) return fail({ loginId: "이미 있는 아이디입니다" });

  const passwordHash = await hashBotPassword(input.password);
  const user = await prisma.user.create({
    data: {
      // ⚠️ 소셜 식별자를 흉내내지 않는다. `provider=GOOGLE` 로 만들면 진짜
      // 유저와 구분이 안 되고, 그 계정으로 소셜 로그인이 붙을 수도 있다
      provider: "GOOGLE",
      subject: `bot:${loginId}`,
      email: null,
      language: input.language,
      isBot: true,
      room: { create: { name: roomName } },
      botAccount: { create: { loginId, passwordHash } },
    },
    select: { id: true },
  });

  revalidate("/admin/bots");
  return { ok: true, botId: user.id };
}

/**
 * 봇 로그인 검증 (D-146).
 *
 * ⚠️ **세션을 만들지 않는다.** 유저 세션을 발급하면 그것이 곧
 * 이메일/비밀번호 로그인 경로가 되어 `FR-05-A-02`(D-021)를 뚫는다. 여기서는
 * **"이 봇으로 행동해도 되는가"만 확인**하고, 실제 행동은 어드민 화면이 봇 id 를
 * 명시해 호출한다.
 */
export async function verifyBot(input: {
  loginId: string;
  password: string;
}): Promise<ActionResult<{ botId: string; roomName: string }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const bot = await prisma.botAccount.findUnique({
    where: { loginId: input.loginId.trim().toLowerCase() },
    select: {
      passwordHash: true,
      user: { select: { id: true, room: { select: { name: true } } } },
    },
  });
  // ⚠️ 아이디가 없는 것과 비밀번호가 틀린 것을 **구분하지 않는다** — 어느
  // 아이디가 존재하는지 알려줄 이유가 없다 (D-083 과 같은 기준)
  const ok = bot
    ? await verifyBotPassword(input.password, bot.passwordHash)
    : false;
  if (!bot || !ok) return fail({}, "아이디 또는 비밀번호가 맞지 않습니다");

  return {
    ok: true,
    botId: bot.user.id,
    roomName: bot.user.room?.name ?? "",
  };
}

/** 봇 뷰어 — 일반 액션에 넘긴다 */
async function botViewer(botId: string) {
  const user = await prisma.user.findFirst({
    where: { id: botId, isBot: true },
    select: { id: true, language: true, room: { select: { id: true } } },
  });
  if (!user?.room) return null;
  return {
    viewer: { userId: user.id, roomId: user.room.id, needsRoomName: false },
    locale: user.language as Locale,
  };
}

/**
 * 봇이 아이템을 올린다.
 *
 * ⚠️ **매칭 키 값을 봇이 만들지 않는다.** 고유번호를 지어내면 실재하지 않는
 * 도감이 자동 생성되고(D-015), 어드민 검증 큐가 가짜로 찬다. "모르겠어요"를
 * 써서 도감 연결을 건너뛴다 (D-032, FR-01-A-02b).
 */
export async function botPostItem(input: {
  botId: string;
  categoryKey: string;
  brand: string;
  model: string;
}): Promise<ActionResult<{ itemId: string }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const b = await botViewer(input.botId);
  if (!b) return fail({}, "봇을 찾을 수 없습니다");

  const itemName = [input.brand, input.model].filter(Boolean).join(" ");

  // ⚠️ 사진은 필수다 (FR-07-A-03) — 플레이스홀더를 만든다. 스토리지 업로드가
  // 실패하면 예외가 아니라 **메시지로** 돌려준다. 크래시가 뜨면 어드민은
  // 브랜드가 문제인지 스토리지가 문제인지 구분할 수 없다
  let photoUrl: string;
  try {
    photoUrl = await makeBotPhoto(itemName || input.categoryKey, b.viewer.userId);
  } catch (e) {
    return fail({}, `사진 생성·업로드 실패 — ${(e as Error).message}`);
  }

  // 별칭은 있으면 좋고 없어도 된다 — 실패해도 등록을 막지 않는다
  let nickname: string | undefined;
  try {
    nickname = await writeItemNickname({ itemName, locale: b.locale });
  } catch {
    nickname = undefined;
  }

  const res = await createItemAs(b.viewer, {
    category: input.categoryKey,
    values: { brand: input.brand, model: input.model },
    photoUrls: [photoUrl],
    nickname,
    // 위 주석 참조 — 고유번호를 지어내지 않는다
    unknownMatchingKey: true,
  });
  if (!res.ok) {
    return fail(res.fieldErrors, reason(res, "등록에 실패했습니다"));
  }

  await prisma.botAccount.update({
    where: { userId: b.viewer.userId },
    data: { lastActedAt: new Date() },
  });
  revalidate("/admin/bots", "/[locale]", "/[locale]/me");
  return { ok: true, itemId: res.itemId };
}

/** 봇이 기록을 올린다 — 자기 아이템 중 하나에 연결한다 */
export async function botPostDiary(input: {
  botId: string;
}): Promise<ActionResult<{ diaryId: string }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const b = await botViewer(input.botId);
  if (!b) return fail({}, "봇을 찾을 수 없습니다");

  // 연결할 아이템이 없으면 기록도 쓰지 않는다 — 물건 없는 기록은 이 서비스의
  // 전제(원칙 1: 소유하는 동안 데이터가 쌓인다)와 맞지 않는다
  const item = await prisma.item.findFirst({
    where: { roomId: b.viewer.roomId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      model: true,
      brand: { select: { name: true } },
      category: { select: { key: true } },
    },
  });
  if (!item) return fail({}, "먼저 아이템을 올려주세요");

  const itemName =
    [item.brand?.name, item.model].filter(Boolean).join(" ") || "물건";

  // ⚠️ **Claude 실패를 예외로 흘리지 않는다.** 키가 없거나 API 가 죽으면
  // 화면에 크래시가 뜬다 — 어드민은 무엇이 잘못됐는지 알 수 없다.
  // 기록은 본문이 필수라(diary FR-01-A-07) 대체 문구로 넘기지도 않는다
  let body: string;
  try {
    body = await writeDiaryBody({
      itemName,
      categoryLabel: item.category.key,
      locale: b.locale,
    });
  } catch (e) {
    return fail({}, `글 생성 실패 — ${(e as Error).message}`);
  }

  const res = await createDiaryAs(b.viewer, {
    body,
    visibility: "PUBLIC",
    photoUrls: [],
    itemIds: [item.id],
  });
  if (!res.ok) {
    return fail(res.fieldErrors, reason(res, "작성에 실패했습니다"));
  }

  await prisma.botAccount.update({
    where: { userId: b.viewer.userId },
    data: { lastActedAt: new Date() },
  });
  revalidate("/admin/bots", "/[locale]/me");
  return { ok: true, diaryId: res.diaryId };
}
