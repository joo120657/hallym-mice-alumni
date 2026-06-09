"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AlbumRow } from "@/types/database";

/**
 * 앨범 상세 인라인 관리바에 주입하는 공개/비공개 토글.
 * 게시 동의(consent_confirmed)가 없으면 비활성 — 동의 확인은 풀 편집 화면에서만(초상권).
 * 서버도 consent 없이 공개 시 400 으로 거부하므로(route.ts) 비활성은 보조 UX 일 뿐.
 * 성공 시 router.refresh()로 SSR 재검증한다.
 */
export function AlbumPublishToggle({ album }: { album: AlbumRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setPublic(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_public: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "변경에 실패했어요.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  const canPublish = album.consent_confirmed;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="inline-album-public" className="text-sm">
        공개
      </Label>
      <Switch
        id="inline-album-public"
        checked={album.is_public}
        disabled={busy || !canPublish}
        onCheckedChange={(v) => void setPublic(v)}
      />
      {!canPublish ? (
        <span className="text-xs text-muted-foreground">
          게시 동의 확인은 편집 화면에서
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
