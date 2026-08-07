import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      /** 방은 유저와 1:1 (M-02) */
      roomId?: string;
      /** 신규 가입 — 방 이름을 아직 정하지 않았다 (FR-05-A-05) */
      needsRoomName: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    roomId?: string;
    needsRoomName?: boolean;
  }
}
