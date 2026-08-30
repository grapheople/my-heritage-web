"use server";

import { getAdmin } from "@/lib/auth/admin";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { createItemAs } from "@/lib/actions/item";
import { createDiaryAs } from "@/lib/actions/diary";
import { botEnabled } from "@/lib/bot/guard";
import {
  researchItemContent,
  writeDiaryBody,
} from "@/lib/bot/claude";
import { categoryFields, sanitize } from "@/lib/bot/fields";
import { userLocalDate } from "@/lib/format";
import { userTimezone } from "@/lib/actions/shared";
import { hashBotPassword, verifyBotPassword } from "@/lib/bot/password";
import { makeBotPhoto } from "@/lib/bot/photo";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, storeImage, validateUpload } from "@/lib/storage";
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
  labels: Record<string, string> = {},
): string {
  if (res.formError) return res.formError;
  const parts = Object.entries(res.fieldErrors).map(
    ([k, v]) => `${labels[k] ?? LABEL[k] ?? k}: ${v}`,
  );
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
 * 봇 아이템 사진 **직접 업로드** (D-154).
 *
 * ## ⚠️ `/api/upload` 를 쓸 수 없다
 * 그 라우트는 **유저 세션이 필수**다 (열어두면 스토리지가 아무나 쓰는 파일
 * 서버가 된다). 어드민은 유저 세션이 아니므로 401 이 난다. 그렇다고 그 라우트를
 * 열면 **봇을 위해 전체 업로드 경로를 여는 것**이 되므로, 봇 가드를 그대로 타는
 * 별도 액션을 둔다.
 *
 * ## ⚠️ 저장은 **일반 경로**를 탄다
 * `storeImage` 를 그대로 쓴다 — 정방형·500KB 이하·EXIF 제거가 봇 사진에도
 * 똑같이 적용된다 (D-128·D-129). 위치정보가 붙은 채로 나가면 D-031 절도
 * 리스크가 실제 주소가 된다
 *
 * ## ⚠️ 크롭 UI 는 붙이지 않는다
 * 유저는 `SquareCropper` 로 구도를 잡지만(D-129), 시딩 사진에 그 단계를 두면
 * 어드민이 장마다 조작해야 한다. `storeImage` 의 **중앙 크롭**에 맡긴다
 */
export async function botUploadPhoto(
  form: FormData,
): Promise<ActionResult<{ url: string }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const botId = String(form.get("botId") ?? "");
  const b = await botViewer(botId);
  if (!b) return fail({}, "봇을 찾을 수 없습니다");

  const file = form.get("file");
  if (!(file instanceof File)) return fail({}, "파일이 없습니다");

  const check = validateUpload(file.type, file.size);
  if (!check.ok) return fail({}, check.message);

  // Content-Length 를 믿지 않는다 — 실제 바이트로 다시 본다
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail({}, "파일이 너무 큽니다");

  try {
    // 아이템이 아직 없으므로 봇 id + 타임스탬프로 키를 만든다
    const key = `${b.viewer.userId}/${Date.now()}-${bytes.byteLength}`;
    const stored = await storeImage(bytes, key);
    return { ok: true, url: stored.url };
  } catch (e) {
    return fail({}, `업로드 실패 — ${(e as Error).message}`);
  }
}

/** 카테고리 이름 — 어드민은 ko 전용이다 (D-030). 없으면 키를 그대로 쓴다 */
async function categoryLabel(key: string): Promise<string> {
  const messages = (await import("../../../messages/ko.json")).default as {
    category?: Record<string, string>;
  };
  return messages.category?.[key] ?? key;
}

/** 봇 타임존 기준 오늘 — 미래 구매일을 걸러내는 기준 (D-056) */
async function botToday(userId: string): Promise<string> {
  return userLocalDate(await userTimezone(userId));
}

/**
 * 자료를 수집해 **모든 항목**을 채운다 — 등록하지 않고 돌려준다 (D-153).
 *
 * ## ⚠️ 바로 저장하지 않는 이유
 * 고유값(레퍼런스 번호)이 틀리면 **실재하지 않는 도감이 생기고**(D-015) 남에게
 * "같은 물건 가진 사람"으로 노출된다. 어드민이 한 번 보는 단계를 남긴다 —
 * 프롬프트에 "모르면 비운다"를 박아두는 것만으로는 부족하다.
 */
export async function botResearchItem(input: {
  botId: string;
  categoryKey: string;
  brand: string;
  hint: string;
}): Promise<
  ActionResult<{
    values: Record<string, string>;
    dropped: string[];
  }>
> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const b = await botViewer(input.botId);
  if (!b) return fail({}, "봇을 찾을 수 없습니다");

  const fields = await categoryFields(input.categoryKey);
  if (fields.length === 0) {
    return fail({}, "이 카테고리에 속성 조합이 설정되지 않았습니다 (A-02)");
  }

  try {
    const r = await researchItemContent({
      fields,
      categoryKey: input.categoryKey,
      // ⚠️ **키가 아니라 이름을 넘긴다** (D-167). `workout` 만 보고는 무엇을
      // 채우는 화면인지 모른다 — 카테고리 성격이 답을 크게 가른다
      categoryLabel: await categoryLabel(input.categoryKey),
      brand: input.brand,
      hint: input.hint,
      locale: b.locale,
      today: await botToday(b.viewer.userId),
    });
    return { ok: true, values: r.values, dropped: r.dropped };
  } catch (e) {
    // ⚠️ 예외를 흘리지 않는다 — 화면에 크래시가 뜨면 어드민은 CLI 문제인지
    // 프롬프트 문제인지 구분할 수 없다 (D-150)
    return fail({}, `자료 수집 실패 — ${(e as Error).message}`);
  }
}

/**
 * 봇이 아이템을 올린다.
 *
 * ## ⚠️ 값은 **정제해서** 저장한다
 * `createItemAs` 는 옵션 키·날짜 형식·숫자 여부를 검증하지 않는다. 화면에서
 * 넘어온 값도 한 번 더 `sanitize` 를 통과시킨다 — 자료 수집을 건너뛰고 손으로
 * 채운 값도 있고, 클라이언트를 신뢰할 이유가 없다.
 *
 * ## ⚠️ 고유값이 비어 있으면 도감을 만들지 않는다
 * 값이 있을 때만 도감에 연결·생성한다. 지어낸 고유값을 넣으면 실재하지 않는
 * 도감이 생기므로(D-015), **비우는 쪽이 안전한 기본값**이다 (D-032).
 *
 * ## 사진은 올린 것이 있으면 그것을 쓴다 (D-154)
 * 없으면 플레이스홀더를 만든다 — 아이템은 사진 1장이 필수다 (FR-07-A-03).
 */
export async function botPostItem(input: {
  botId: string;
  categoryKey: string;
  brand: string;
  /** 속성 키 → 값. 자료 수집 결과 또는 어드민이 손으로 고친 값 */
  values: Record<string, string>;
  /** 직접 업로드한 사진. 비면 플레이스홀더를 만든다. 첫 장이 대표 (FR-07-A-04) */
  photoUrls?: string[];
}): Promise<ActionResult<{ itemId: string; codexLinked: boolean }>> {
  const g = await guard();
  if ("error" in g) return fail({}, g.error);

  const b = await botViewer(input.botId);
  if (!b) return fail({}, "봇을 찾을 수 없습니다");

  const fields = await categoryFields(input.categoryKey);
  if (fields.length === 0) {
    return fail({}, "이 카테고리에 속성 조합이 설정되지 않았습니다 (A-02)");
  }

  const clean = sanitize(fields, input.values, await botToday(b.viewer.userId), {
    // 화면에서 온 값은 어드민이 확인한 것이다 — 링크를 받는다
    allowUrls: true,
  });
  const values: Record<string, string> = {
    ...clean.values,
    brand: input.brand,
  };

  const itemName = [input.brand, values.model].filter(Boolean).join(" ");

  // ⚠️ 사진은 필수다 (FR-07-A-03). 직접 올린 것이 있으면 쓰고(D-154), 없으면
  // 플레이스홀더를 만든다. 스토리지가 실패하면 예외가 아니라 **메시지로**
  // 돌려준다 — 크래시가 뜨면 어드민은 브랜드가 문제인지 스토리지가 문제인지
  // 구분할 수 없다
  const uploaded = (input.photoUrls ?? []).filter((u) => u.trim());
  let photoUrls: string[];
  if (uploaded.length > 0) {
    photoUrls = uploaded;
  } else {
    try {
      photoUrls = [
        await makeBotPhoto(itemName || input.categoryKey, b.viewer.userId),
      ];
    } catch (e) {
      return fail({}, `사진 생성·업로드 실패 — ${(e as Error).message}`);
    }
  }

  /*
    도감 연결은 **`createItemAs` 가 값만 보고 판정한다** (D-169) — 매칭 키가 비면
    `buildMatchingKey` 가 `null` 을 내 건너뛴다. 봇이 따로 플래그를 넘기지 않는다.
    화면에 알려줄 값만 여기서 같은 규칙으로 미리 계산한다.
  */
  const keyFields = fields.filter((f) => f.isMatchingKey);
  const codexLinked =
    keyFields.length > 0 && keyFields.every((f) => values[f.key]?.trim());

  const res = await createItemAs(b.viewer, {
    category: input.categoryKey,
    values,
    photoUrls,
  });
  if (!res.ok) {
    const labels = Object.fromEntries(fields.map((f) => [f.key, f.label]));
    return fail(res.fieldErrors, reason(res, "등록에 실패했습니다", labels));
  }

  await prisma.botAccount.update({
    where: { userId: b.viewer.userId },
    data: { lastActedAt: new Date() },
  });
  revalidate("/admin/bots", "/[locale]", "/[locale]/me");
  return { ok: true, itemId: res.itemId, codexLinked };
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
