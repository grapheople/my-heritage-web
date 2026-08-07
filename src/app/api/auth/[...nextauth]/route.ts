import { handlers } from "@/lib/auth/config";

/**
 * Auth.js 핸들러. `proxy.ts` matcher 가 `/api` 를 제외하므로
 * locale prefix 가 붙지 않는다 (D-030 와 같은 이유).
 */
export const { GET, POST } = handlers;
