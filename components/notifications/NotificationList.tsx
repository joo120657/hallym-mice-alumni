"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EMPTY } from "@/lib/messages";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/types/database";

/**
 * 알림 인박스 (§6.8). /api/notifications 로만 접근(서버, requireMember).
 * 클릭 시 단건 읽음, 상단 버튼으로 전체 읽음. 알림 생성은 본 범위 밖(읽기 전용 인박스).
 */
const TYPE_LABEL: Record<string, string> = {
  proposal: "새 제안이 도착했어요",
  proposal_email: "새 제안이 도착했어요",
  report_resolved: "신고가 처리됐어요",
  job_published: "공고가 게시됐어요",
};

function titleOf(n: NotificationRow): string {
  const t = n.payload?.title;
  if (typeof t === "string" && t) return t;
  return TYPE_LABEL[n.type] ?? "알림";
}
function messageOf(n: NotificationRow): string | null {
  const m = n.payload?.message;
  return typeof m === "string" && m ? m : null;
}
function linkOf(n: NotificationRow): string | null {
  const l = n.payload?.link;
  return typeof l === "string" && l.startsWith("/") ? l : null;
}

export function NotificationList() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const json = await res.json();
      setItems(json.items ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasUnread = items.some((n) => !n.read_at);

  async function markAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
        keepalive: true,
      });
      if (res.ok) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
        router.refresh(); // 헤더 벨 미읽음 배지 재검증.
      }
    } finally {
      setBusy(false);
    }
  }

  async function markOne(n: NotificationRow) {
    if (n.read_at) return;
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)),
    );
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: n.id }),
        keepalive: true, // 링크 이동으로 요청이 끊겨도 서버 read_at 갱신 보장.
      });
      router.refresh(); // 헤더 벨 미읽음 배지 재검증.
    } catch {
      // 낙관적 — 실패해도 조용히.
    }
  }

  if (status === "loading") return <LoadingSkeleton variant="list" count={4} />;
  if (status === "error") return <ErrorState onRetry={() => void load()} />;
  if (items.length === 0) {
    return (
      <EmptyState
        title={EMPTY.notificationsEmpty.title}
        description={EMPTY.notificationsEmpty.cta}
      />
    );
  }

  return (
    <div className="space-y-3">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void markAll()}>
            모두 읽음
          </Button>
        </div>
      ) : null}
      <ul className="space-y-2">
        {items.map((n) => {
          const unread = !n.read_at;
          const message = messageOf(n);
          const link = linkOf(n);
          const card = (
            <Card
              className={cn(
                "flex items-start gap-3 p-4 transition-colors hover:bg-accent/40",
                unread && "border-primary/40 bg-primary/5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  unread ? "bg-primary" : "bg-transparent",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{titleOf(n)}</p>
                {message ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {message}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(n.created_at)}
                </p>
              </div>
              {link ? (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null}
            </Card>
          );
          return (
            <li key={n.id}>
              {link ? (
                <Link
                  href={link}
                  onClick={() => void markOne(n)}
                  className="block"
                >
                  {card}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void markOne(n)}
                  className="block w-full text-left"
                >
                  {card}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
