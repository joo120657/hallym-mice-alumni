"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * 2단계 확인 후 DELETE 를 호출하는 공용 삭제 버튼.
 * 회원-대면 인라인 관리바와 운영자 편집 화면(콘텐츠/앨범 DangerZone)에서 공유한다.
 *
 * - redirectTo 가 있으면 삭제 후 그 경로로 이동(회원뷰: 현재 URL 이 삭제되어 not_found 되므로 필수).
 * - 없으면 onDeleted 콜백(편집 화면: 목록으로 이동 등).
 * - 권한은 호출 대상 API(withAuth role=admin)가 강제한다 — 이 컴포넌트는 UX 일 뿐.
 */
export function ConfirmDeleteButton({
  url,
  confirmText = "정말 삭제할까요?",
  redirectTo,
  onDeleted,
  label = "삭제",
}: {
  url: string;
  confirmText?: string;
  redirectTo?: string;
  onDeleted?: () => void;
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "삭제에 실패했어요.");
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else onDeleted?.();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{confirmText}</span>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void remove()}
          >
            삭제
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            취소
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
