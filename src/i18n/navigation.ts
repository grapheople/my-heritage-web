import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * locale을 자동으로 붙여주는 navigation API.
 * 유저 화면에서는 `next/link`·`next/navigation` 대신 반드시 이걸 쓴다.
 * 어드민(`/admin`)은 ko 단일(D-030)이므로 locale prefix가 없다 — 거기서는 `next/link`를 쓴다.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
