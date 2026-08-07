import NextAuth, { type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Google from "next-auth/providers/google";
import { AuthProvider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * 인증 — Google · Apple 소셜만 (D-021, FR-05-A-01).
 * **이메일/비밀번호 가입은 제공하지 않는다** (FR-05-A-02).
 *
 * Apple 을 유지하는 근거는 **iOS 앱 배포 요건이 아니다** — 웹으로 개발하므로
 * 그 근거는 폐기됐다. 3개 시장 중 일본의 iPhone 점유율이 가장 높아서다
 * (D-092, D-021 근거 교체).
 *
 * ## Prisma Adapter 를 쓰지 않는다
 *
 * 기존 `User` 모델이 `provider` + `subject` + `@@unique([provider, subject])`
 * 형태로 이미 설계돼 있다 (M-01). Auth.js 표준 Adapter 는 `Account`·`Session`·
 * `VerificationToken` 테이블을 따로 요구하는데, 그러면 같은 정보를 두 곳에
 * 두는 셈이다. **JWT 세션 + signIn 콜백에서 직접 upsert** 하는 방식이 기존
 * 스키마와 정합한다.
 */
const PROVIDER_MAP: Record<string, AuthProvider> = {
  google: AuthProvider.GOOGLE,
  apple: AuthProvider.APPLE,
};

export const authConfig = {
  providers: [Google, Apple],

  session: { strategy: "jwt" },

  pages: {
    // S-13. 기본 Auth.js 화면을 쓰지 않는다 — 3개 언어 UI 가 필요하다 (D-003)
    signIn: "/login",
  },

  callbacks: {
    /**
     * 소셜 인증이 끝난 시점에 우리 `User` 로 upsert 한다.
     *
     * ⚠️ Apple 이 "이메일 비공개"를 선택하면 릴레이 이메일이 온다 —
     * 그대로 저장한다 (FR-05-A-04). 이메일을 계정 식별자로 쓰지 않는 이유이기도
     * 하다. 식별은 항상 `(provider, subject)` 다.
     */
    async signIn({ account }) {
      if (!account) return false;
      const provider = PROVIDER_MAP[account.provider];
      if (!provider) return false;
      return true;
    },

    async jwt({ token, account, profile }) {
      // 최초 로그인 시에만 account 가 온다
      if (account) {
        const provider = PROVIDER_MAP[account.provider];
        if (!provider) return token;

        const subject = account.providerAccountId;
        const email = (profile?.email as string | undefined) ?? null;

        const user = await prisma.user.upsert({
          where: { provider_subject: { provider, subject } },
          update: { email },
          create: {
            provider,
            subject,
            email,
            // 방은 유저와 1:1 이다 (M-02). 가입 시 함께 만든다.
            // ⚠️ 방 이름은 가입 직후 유저가 정해야 한다 (FR-05-A-05) —
            //    그 화면이 아직 없다. 임시로 빈 값을 두고 설정 화면으로 유도한다
            room: { create: { name: "" } },
          },
          select: { id: true, room: { select: { id: true, name: true } } },
        });

        token.userId = user.id;
        token.roomId = user.room?.id;
        // 방 이름이 비어 있으면 신규 가입이다 (FR-05-A-05)
        token.needsRoomName = !user.room?.name;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.userId as string,
        roomId: token.roomId as string | undefined,
        needsRoomName: Boolean(token.needsRoomName),
      };
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
