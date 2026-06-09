"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { BlockedMembers } from "@/components/profile/BlockedMembers";
import { createClient } from "@/lib/supabase/client";

/**
 * 계정 설정 / 위험 영역 (§8.3 / §11.5 / T-108).
 * "프로필 비공개(복구 가능)" 와 "탈퇴/파기(비가역)" 를 명확히 분리한다.
 */
export function AccountSettings({ isPublic }: { isPublic: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(!isPublic);
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  async function toggleHide() {
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: hidden ? "unhide" : "hide" }),
      });
      if (res.ok) {
        setHidden((h) => !h);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4">
        <p className="text-sm font-semibold">프로필 공개</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hidden
            ? "지금은 비공개 상태예요. 디렉토리에 보이지 않아요. 데이터는 그대로 유지돼요."
            : "디렉토리에 공개돼 다른 회원이 찾을 수 있어요."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={toggleHide}
          disabled={busy}
        >
          {hidden ? "다시 공개하기" : "프로필 비공개로 전환"}
        </Button>
      </div>

      <BlockedMembers />

      <LogoutButton variant="outline" className="w-full" />

      {/* 위험 영역 */}
      <div className="rounded-lg border border-destructive/40 p-4">
        <p className="text-sm font-semibold text-destructive">탈퇴 / 파기</p>
        <p className="mt-1 text-xs text-muted-foreground">
          탈퇴하면 이름·학번·소속 등 식별 정보가 즉시 익명화되고 복구할 수 없어요.
          (비식별 통계만 남아요.) 잠시 쉬려면 위의 &quot;프로필 비공개&quot;를 쓰세요.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3"
          onClick={() => setWithdrawOpen(true)}
        >
          탈퇴하기
        </Button>
      </div>

      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} />
    </div>
  );
}

function WithdrawDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "탈퇴 처리에 실패했어요.");
        setBusy(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/login?withdrawn=1";
    } catch {
      setError("탈퇴 처리에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 탈퇴할까요?</DialogTitle>
          <DialogDescription>
            식별 정보가 즉시 익명화되고 복구할 수 없어요. 확인을 위해
            아래에 <b>탈퇴</b>를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="탈퇴"
          aria-label="탈퇴 확인 입력"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={withdraw}
            disabled={busy || confirm.trim() !== "탈퇴"}
          >
            {busy ? "처리 중..." : "영구 탈퇴"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
