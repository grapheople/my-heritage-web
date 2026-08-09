"use server";

import { cookies } from "next/headers";
import { CATEGORY_COOKIE } from "@/lib/category-scope";

/**
 * 보고 있는 카테고리를 바꾼다 (D-137).
 *
 * ⚠️ **쿠키에 남긴다.** 비로그인도 다음 방문에 같은 카테고리로 들어와야
 * 한다 — 관람자를 로그인 벽으로 막지 않는다는 D-069 의 취지다.
 *
 * 로그인 유저의 선호 카테고리(D-124)는 **건드리지 않는다.** 잠깐 다른
 * 카테고리를 둘러본 것이 설정을 덮으면 안 된다.
 */
export async function setCategory(key: string): Promise<void> {
  (await cookies()).set(CATEGORY_COOKIE, key, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    path: "/",
  });
}
