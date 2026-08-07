import { cn } from "@/lib/utils";

/**
 * 어드민 공용 요소 (D-030).
 *
 * **문자열을 하드코딩한다.** 어드민 UI 언어는 ko 단일이므로 `messages/*.json`
 * 에 넣지 않는다 — 넣으면 유저 화면 번들에 어드민 문구가 섞이고, 3개 언어를
 * 유지해야 하는 것처럼 오해된다.
 *
 * 단 **어드민이 입력하는 유저 노출 필드**는 3개 언어 입력이 필요하다
 * (D-010·D-030) → `TriLingualField`.
 */
export function AdminPage({
  id, title, desc, action, children,
}: {
  /** A-xx */
  id: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{id}</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">{title}</h1>
          {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}

/** 큐 크기 카드 — A-13 운영 대시보드 (D-072) */
export function StatCard({
  label, value, href, warn,
}: {
  label: string; value: number; href?: string; warn?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", warn && value > 0 && "text-warn")}>
        {value}
      </p>
    </>
  );
  return href ? (
    <a href={href} className="block rounded-lg border p-4 hover:bg-accent">{body}</a>
  ) : (
    <div className="rounded-lg border p-4">{body}</div>
  );
}

export function Pill({ tone = "muted", children }: {
  tone?: "muted" | "sale" | "warn" | "danger"; children: React.ReactNode;
}) {
  const map = {
    muted: "bg-muted text-muted-foreground",
    sale: "bg-sale-bg text-sale",
    warn: "bg-warn-bg text-warn",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span className={cn("inline-block rounded-sm px-1.5 py-0.5 text-xs font-semibold", map[tone])}>
      {children}
    </span>
  );
}

/**
 * ⚠️ **어드민이 입력하는 유저 노출 필드는 3개 언어를 받는다** (D-010, D-030).
 *
 * 속성 라벨 · enum 선택지 · `number` 단위 · 도감 설명 · alias 가 해당한다.
 * 어드민 UI 가 ko 단일인 것과 **별개다** — 여기서 ko 만 받으면 일본어 유저
 * 화면에 한국어 라벨이 나온다. 빠뜨리기 가장 쉬운 지점이다.
 */
export function TriLingualField({
  label, name, values, required,
}: {
  label: string;
  name: string;
  values?: { ko?: string; ja?: string; en?: string };
  required?: boolean;
}) {
  return (
    <div>
      <span className="text-sm font-semibold">
        {label}
        {required && <span className="text-destructive"> *</span>}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          유저에게 보이는 문구 — 3개 언어 모두 필요
        </span>
      </span>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {(["ko", "ja", "en"] as const).map((l) => (
          <label key={l} className="block">
            <span className="text-xs text-muted-foreground uppercase">{l}</span>
            <input
              name={`${name}.${l}`}
              defaultValue={values?.[l] ?? ""}
              className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
