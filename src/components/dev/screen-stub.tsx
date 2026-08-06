import { Badge } from "@/components/ui/badge";

/**
 * 화면 스켈레톤 플레이스홀더.
 *
 * IA(화면 ID·담당 프로젝트)는 planning spec에서 확정됐지만 UI는 디자인 탐색 대기 상태다.
 * 실제 화면을 구현하면 이 컴포넌트를 지운다 — 남아 있는 stub은 미구현 화면 목록이다.
 */
export function ScreenStub({
  id,
  title,
  owner,
  spec,
}: {
  /** 화면 ID (S-01 ~ S-21 / A-01 ~ A-13) */
  id: string;
  title: string;
  /** 담당 프로젝트 — my-heritage-planning/projects/{owner} */
  owner: string;
  /** 참조할 문서 경로·섹션 */
  spec: string;
}) {
  return (
    <section className="space-y-3 p-6">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {id}
        </Badge>
        <Badge variant="secondary">미구현</Badge>
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <dl className="space-y-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt className="min-w-16">담당</dt>
          <dd className="font-mono">{owner}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-16">기준 문서</dt>
          <dd className="font-mono break-all">{spec}</dd>
        </div>
      </dl>
    </section>
  );
}
