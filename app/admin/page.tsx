import Link from "next/link";

import { getDashboardSummary } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { EMPTY } from "@/lib/messages";

/**
 * 관리자 대시보드 (§6.7 / §11.6 / T-301).
 * 상단: 오늘 할 일(미처리 신고 N) / 스크롤: 최근 가입·최근 신고 / 하단: 빠른 링크.
 * 우선순위: 신고 > 회원 > 통계. 로딩/정상/에러/빈 상태 처리.
 * 서버 컴포넌트 — layout 의 requireAdmin 가드가 접근을 보장한다.
 */
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  student: "재학생",
  alumni: "동문",
  faculty: "교직원",
  partner: "파트너",
  admin: "관리자",
};

const STATUS_LABEL: Record<string, string> = {
  active: "활성",
  suspended: "정지",
  withdrawn: "탈퇴",
};

export default async function AdminDashboardPage() {
  let summary: Awaited<ReturnType<typeof getDashboardSummary>> | null = null;
  try {
    summary = await getDashboardSummary();
  } catch {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-bold">대시보드</h1>
        <ErrorState description="대시보드 데이터를 불러오지 못했어요." />
      </section>
    );
  }

  const { openReportCount, reviewingReportCount, recentSignups, recentReports } =
    summary;
  const pending = openReportCount + reviewingReportCount;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          오늘 처리할 일을 우선순위(신고 &gt; 회원)대로 확인하세요.
        </p>
      </header>

      {/* 오늘 할 일 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              미처리 신고
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold tabular-nums">
                {openReportCount}
              </span>
              <Link
                href="/admin/reports?status=open"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                처리하기
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              검토 중 신고
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold tabular-nums">
                {reviewingReportCount}
              </span>
              <Link
                href="/admin/reports?status=reviewing"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                이어서
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 최근 신고 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 신고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentReports.length === 0 ? (
            <EmptyState
              title={EMPTY.adminNoTasks.title}
              description={EMPTY.adminNoTasks.cta}
              className="py-8"
            />
          ) : (
            <ul className="divide-y">
              {recentReports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">[{r.target_type}]</span>{" "}
                    {r.reason ?? "사유 없음"}
                  </span>
                  <ReportStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 최근 가입 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 가입</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentSignups.length === 0 ? (
            <EmptyState title="최근 가입한 회원이 없어요" className="py-8" />
          ) : (
            <ul className="divide-y">
              {recentSignups.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.name}
                    {m.is_verified ? (
                      <Badge variant="success" className="ml-2 align-middle">
                        인증
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">
                    {ROLE_LABEL[m.role] ?? m.role} ·{" "}
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 빠른 링크 */}
      <div className="grid grid-cols-3 gap-3">
        <QuickLink href="/admin/reports" label="신고 관리" badge={pending} />
        <QuickLink href="/admin/members" label="회원 관리" />
        <QuickLink href="/admin/jobs" label="구인 승인" />
        <QuickLink href="/admin/content" label="콘텐츠" />
        <QuickLink href="/admin/albums" label="갤러리" />
      </div>
    </section>
  );
}

function QuickLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border bg-card text-center text-sm font-medium hover:bg-accent"
    >
      <span>{label}</span>
      {badge && badge > 0 ? (
        <Badge variant="destructive">{badge}</Badge>
      ) : null}
    </Link>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "outline" }> = {
    open: { label: "신규", variant: "destructive" },
    reviewing: { label: "검토중", variant: "default" },
    resolved: { label: "처리완료", variant: "success" },
    dismissed: { label: "기각", variant: "secondary" },
  };
  const s = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
