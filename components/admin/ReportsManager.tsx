"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EMPTY } from "@/lib/messages";
import type { ReportRow, ReportStatus } from "@/types/database";

/**
 * 신고 관리 클라이언트 (T-302 / §6.7).
 * 상태머신(open→reviewing→resolved/dismissed) + 대상 숨김 + 회원 정지(suspend).
 * 데이터 접근은 전부 /api/admin/reports(서버, requireAdmin)로만 한다(브라우저 DB 직접 접근 없음).
 */

type ReportWithTarget = ReportRow & {
  target_profile: {
    id: string;
    name: string;
    status: string;
    is_public: boolean;
  } | null;
  target_title: string | null;
};

/** 신고 대상으로 이동하는 링크(관리자가 무엇을 처리하는지 직접 확인). */
function targetHref(r: ReportWithTarget): string {
  if (r.target_type === "job") return `/jobs/${r.target_id}`;
  if (r.target_type === "article") return `/admin/content/${r.target_id}`;
  return `/alumni/${r.target_id}`;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "신규" },
  { value: "reviewing", label: "검토중" },
  { value: "resolved", label: "처리완료" },
  { value: "dismissed", label: "기각" },
  { value: "all", label: "전체" },
];

const STATUS_META: Record<
  ReportStatus,
  { label: string; variant: "default" | "secondary" | "success" | "destructive" }
> = {
  open: { label: "신규", variant: "destructive" },
  reviewing: { label: "검토중", variant: "default" },
  resolved: { label: "처리완료", variant: "success" },
  dismissed: { label: "기각", variant: "secondary" },
};

const TARGET_LABEL: Record<string, string> = {
  profile: "프로필",
  job: "공고",
  article: "콘텐츠",
};

export function ReportsManager({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [reports, setReports] = useState<ReportWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/reports?status=${encodeURIComponent(status)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const json = await res.json();
      setReports(json.reports ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    reportId: string,
    payload: { status?: ReportStatus; action?: "hide" | "suspend" },
  ) {
    setBusyId(reportId);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error ?? "처리에 실패했어요.");
        return;
      }
      await load();
    } catch {
      setActionError("네트워크 오류가 발생했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : reports.length === 0 ? (
        <EmptyState
          title={EMPTY.adminNoTasks.title}
          description={EMPTY.adminNoTasks.cta}
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    <Badge variant="outline" className="mr-2">
                      {TARGET_LABEL[r.target_type] ?? r.target_type}
                    </Badge>
                    {r.target_profile?.name ??
                      r.target_title ??
                      r.target_id.slice(0, 8)}
                  </CardTitle>
                  <Badge variant={STATUS_META[r.status].variant}>
                    {STATUS_META[r.status].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {r.reason ?? "사유가 입력되지 않았어요."}
                </p>
                {r.target_profile ? (
                  <p className="text-xs text-muted-foreground">
                    대상 상태: {r.target_profile.status} ·{" "}
                    {r.target_profile.is_public ? "공개" : "비공개(숨김)"}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={targetHref(r)}>보기</Link>
                  </Button>
                  {/* 상태 전이 */}
                  {r.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { status: "reviewing" })}
                    >
                      검토 시작
                    </Button>
                  ) : null}
                  {r.status !== "resolved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { status: "resolved" })}
                    >
                      처리완료
                    </Button>
                  ) : null}
                  {r.status !== "dismissed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { status: "dismissed" })}
                    >
                      기각
                    </Button>
                  ) : null}

                  {/* 제재 액션 */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void patch(r.id, { status: "resolved", action: "hide" })
                    }
                  >
                    대상 숨김
                  </Button>
                  {r.target_type === "profile" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === r.id}
                      onClick={() =>
                        void patch(r.id, { status: "resolved", action: "suspend" })
                      }
                    >
                      회원 정지
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
