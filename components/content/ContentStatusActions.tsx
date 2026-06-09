"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { ArticleStatus } from "@/types/database";

/**
 * 콘텐츠 상세 인라인 관리바에 주입하는 게시 상태 토글(게시/임시저장/숨김).
 * 상태만 단독 PATCH 하고(본문 누락 정상), 성공 시 router.refresh()로 SSR 재검증한다.
 * 권한은 /api/admin/content/[id] PATCH(withAuth role=admin)가 강제한다.
 */
export function ContentStatusActions({
  articleId,
  status,
}: {
  articleId: string;
  status: ArticleStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: ArticleStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/content/${articleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "상태 변경에 실패했어요.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {status !== "published" ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void changeStatus("published")}
        >
          게시하기
        </Button>
      ) : null}
      {status !== "draft" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void changeStatus("draft")}
        >
          임시저장으로
        </Button>
      ) : null}
      {status !== "hidden" ? (
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={() => void changeStatus("hidden")}
        >
          숨김
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
