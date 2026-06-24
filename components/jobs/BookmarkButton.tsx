"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 관심 공고 북마크 토글 (낙관적 업데이트). 카드(아이콘)와 상세(라벨) 모두에서 재사용.
 * 카드 안의 Link 위에 올라가므로 클릭 전파를 막는다.
 */
export function BookmarkButton({
  jobId,
  initial,
  variant = "ghost",
  size = "icon",
  showLabel = false,
  className,
}: {
  jobId: string;
  initial: boolean;
  variant?: "ghost" | "outline" | "secondary";
  size?: "icon" | "default" | "sm" | "lg";
  showLabel?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next); // 낙관적.
    try {
      const res = await fetch(`/api/jobs/${jobId}/bookmark`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setOn(!next);
        return;
      }
      router.refresh();
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-pressed={on}
      aria-label={on ? "북마크 해제" : "북마크"}
      onClick={toggle}
      className={className}
    >
      <Bookmark className={cn("h-4 w-4", on && "fill-current text-primary")} />
      {showLabel ? (on ? "저장됨" : "저장") : null}
    </Button>
  );
}
