"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Ban, Flag, MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CONTACT } from "@/lib/messages";
import type { PublicProfileDetail } from "@/lib/profile/visibility";

/**
 * 프로필 상세 연락 영역 (§6.3 / §11.4 / T-204·T-205·T-206).
 *
 *  1) 오픈카톡 공개 시 "오픈카톡으로 연결" 버튼(클릭=coffeechat_click 기록 후 새 탭).
 *  2) 없거나 비공개면 제안 이메일(서버 중계 폼, proposal_email_click 기록).
 *  3) 신고 / 차단.
 * 실제 이메일·원문은 응답·UI 어디에도 노출하지 않는다.
 */
export function ContactActions({ profile }: { profile: PublicProfileDetail }) {
  const router = useRouter();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function recordEvent(eventType: string) {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType, targetId: profile.id }),
      });
    } catch {
      // 이벤트 실패는 연결을 막지 않는다.
    }
  }

  async function openKakao() {
    await recordEvent("coffeechat_click");
    window.open(profile.open_kakao_url!, "_blank", "noopener,noreferrer");
  }

  if (blocked) {
    return (
      <Alert>
        <AlertDescription>
          이 회원을 차단했어요. 더 이상 이 프로필이 상대에게 보이지 않고, 제안도
          주고받을 수 없어요.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {profile.open_kakao_url ? (
        <Button className="w-full" size="lg" onClick={openKakao}>
          <MessageCircle className="h-4 w-4" />
          오픈카톡으로 연결
        </Button>
      ) : profile.proposal_email_allowed ? (
        <Button
          className="w-full"
          size="lg"
          onClick={() => setProposalOpen(true)}
        >
          <Send className="h-4 w-4" />
          이메일 제안 보내기
        </Button>
      ) : (
        <p className="rounded-md border px-3 py-2 text-center text-sm text-muted-foreground">
          이 회원은 아직 연락 수단을 공개하지 않았어요.
        </p>
      )}

      {/* 오픈카톡이 있어도 제안을 허용하면 보조 버튼 제공 */}
      {profile.open_kakao_url && profile.proposal_email_allowed ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setProposalOpen(true)}
        >
          <Send className="h-4 w-4" />
          이메일 제안 보내기
        </Button>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={() => setReportOpen(true)}
        >
          <Flag className="h-4 w-4" />
          신고
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={() => setBlockOpen(true)}
        >
          <Ban className="h-4 w-4" />
          차단
        </Button>
      </div>

      <ProposalDialog
        open={proposalOpen}
        onOpenChange={setProposalOpen}
        targetId={profile.id}
        targetName={profile.name}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetId={profile.id}
      />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        targetId={profile.id}
        onBlocked={() => {
          setBlocked(true);
          router.refresh();
        }}
      />
    </div>
  );
}

function ProposalDialog({
  open,
  onOpenChange,
  targetId,
  targetName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: string;
  targetName: string;
}) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_profile_id: targetId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "전송에 실패했어요.");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setError("전송에 실패했어요.");
      setState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setState("idle"); setMessage(""); setError(null); } }}>
      <DialogContent>
        {state === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle>{CONTACT.proposalSent.title}</DialogTitle>
              <DialogDescription>{CONTACT.proposalSent.cta}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{targetName} 님에게 제안</DialogTitle>
              <DialogDescription>
                플랫폼이 중계해 전달돼요. 상대의 이메일·내 이메일은 공개되지
                않아요.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="간단한 자기소개와 제안 내용을 적어주세요. (10자 이상)"
              rows={5}
              maxLength={1000}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                onClick={send}
                disabled={state === "sending" || message.trim().length < 10}
              >
                {state === "sending" ? "보내는 중..." : "보내기"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  targetId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: string;
}) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_type: "profile",
          target_id: targetId,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "신고에 실패했어요.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("신고에 실패했어요.");
      setState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setState("idle"); setReason(""); setError(null); } }}>
      <DialogContent>
        {state === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>신고가 접수됐어요</DialogTitle>
              <DialogDescription>
                운영진이 검토 후 처리할게요. 신고해주셔서 감사해요.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>이 프로필 신고</DialogTitle>
              <DialogDescription>
                부적절한 사유를 적어주세요(선택). 운영진이 검토해요.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="신고 사유 (선택)"
              rows={4}
              maxLength={500}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={submit}
                disabled={state === "sending"}
              >
                {state === "sending" ? "접수 중..." : "신고하기"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({
  open,
  onOpenChange,
  targetId,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: string;
  onBlocked: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function block() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_profile_id: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "차단에 실패했어요.");
        setState("error");
        return;
      }
      onOpenChange(false);
      onBlocked();
    } catch {
      setError("차단에 실패했어요.");
      setState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 회원을 차단할까요?</DialogTitle>
          <DialogDescription>
            차단하면 서로의 프로필이 숨겨지고, 제안을 주고받을 수 없어요. 내
            정보에서 해제할 수 있어요.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={block}
            disabled={state === "sending"}
          >
            {state === "sending" ? "처리 중..." : "차단하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
