"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { ProfileRole, ProfileStatus } from "@/types/database";

/**
 * 회원 관리 클라이언트 (T-301/302 / §6.7).
 * 검색 + 역할/상태 변경(정지/해제) + is_verified 배지 토글(비차단).
 * 데이터 접근은 전부 /api/admin/members(서버, requireAdmin)로만 한다.
 */

interface Member {
  id: string;
  user_id: string;
  name: string;
  role: ProfileRole;
  status: ProfileStatus;
  is_verified: boolean;
  organization: string | null;
  position: string | null;
  created_at: string;
}

const ROLE_OPTIONS: { value: ProfileRole; label: string }[] = [
  { value: "student", label: "재학생" },
  { value: "alumni", label: "동문" },
  { value: "faculty", label: "교직원" },
  { value: "partner", label: "파트너" },
  { value: "admin", label: "관리자" },
];

const STATUS_OPTIONS: { value: ProfileStatus; label: string }[] = [
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지" },
  { value: "withdrawn", label: "탈퇴" },
];

const STATUS_BADGE: Record<
  ProfileStatus,
  "success" | "destructive" | "secondary"
> = {
  active: "success",
  suspended: "destructive",
  withdrawn: "secondary",
};

export function MembersManager() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/members?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const json = await res.json();
      setMembers(json.members ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  // 마운트 시 + 상태 필터 변경 시 재조회(검색어는 폼 제출로 트리거).
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function patch(
    profileId: string,
    payload: { role?: ProfileRole; status?: ProfileStatus; isVerified?: boolean },
  ) {
    setBusyId(profileId);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error ?? "변경에 실패했어요.");
        return;
      }
      // 변경(특히 status)이 현재 필터와 어긋날 수 있으므로 재조회해 목록 일관성 유지.
      await load();
    } catch {
      setActionError("네트워크 오류가 발생했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·소속·직함 검색"
          className="w-48 flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" size="sm">
          검색
        </Button>
      </form>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton variant="list" count={4} />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : members.length === 0 ? (
        <EmptyState
          title={EMPTY.searchZero.title}
          description={EMPTY.searchZero.cta}
        />
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {m.name}
                    {m.is_verified ? (
                      <Badge variant="success" className="ml-2 align-middle">
                        인증
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <Badge variant={STATUS_BADGE[m.status]}>
                    {STATUS_OPTIONS.find((s) => s.value === m.status)?.label ??
                      m.status}
                  </Badge>
                </div>
                {(m.organization || m.position) ? (
                  <p className="text-xs text-muted-foreground">
                    {[m.organization, m.position].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">역할</Label>
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        void patch(m.id, { role: v as ProfileRole })
                      }
                    >
                      <SelectTrigger className="h-10" disabled={busyId === m.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">상태</Label>
                    <Select
                      value={m.status}
                      onValueChange={(v) =>
                        void patch(m.id, { status: v as ProfileStatus })
                      }
                    >
                      <SelectTrigger className="h-10" disabled={busyId === m.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <Label
                      htmlFor={`verified-${m.id}`}
                      className="text-sm"
                    >
                      동문 인증 배지
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      비차단 배지(접근 제어 아님)
                    </p>
                  </div>
                  <Switch
                    id={`verified-${m.id}`}
                    checked={m.is_verified}
                    disabled={busyId === m.id}
                    onCheckedChange={(v) =>
                      void patch(m.id, { isVerified: v })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
