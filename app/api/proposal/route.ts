import { withAuth } from "@/lib/guards/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeCohortHash, recordEvent } from "@/lib/analytics/events";
import { sendProposalEmail } from "@/lib/email/proposal";
import { createInAppNotification } from "@/lib/notifications/create";
import { checkDailyLimit } from "@/lib/rate-limit";
import { proposalSchema } from "@/lib/validators";
import type { ProfileRow } from "@/types/database";

/**
 * POST /api/proposal — 제안 이메일 서버 중계 (§6.3-3 / T-204·T-206).
 *
 * 규칙:
 *  - 발신자·수신자의 실제 개인 이메일을 응답에 절대 포함하지 않는다.
 *  - 1일 5건 rate limit(proposal_email_click 이벤트 기준).
 *  - 차단 관계면 중계 거부(§6.3-4).
 *  - 파트너 등 누구든 제안 폼은 가능하나, 수신자가 proposal_email_allowed=false 면 거부.
 */
export const POST = withAuth(
  async (req, { me }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
    }

    const parsed = proposalSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
        { status: 422 },
      );
    }
    const { target_profile_id, message } = parsed.data;

    if (target_profile_id === me.profile.id) {
      return Response.json({ error: "본인에게는 보낼 수 없어요." }, { status: 400 });
    }

    const admin = createAdminClient();

    // 대상 프로필.
    const { data: target } = await admin
      .from("profiles")
      .select("id,user_id,status,proposal_email_allowed,deleted_at")
      .eq("id", target_profile_id)
      .maybeSingle<Pick<ProfileRow, "id" | "user_id" | "status" | "proposal_email_allowed" | "deleted_at">>();

    if (!target || target.status !== "active" || target.deleted_at) {
      return Response.json({ error: "보낼 수 없는 대상이에요." }, { status: 404 });
    }
    if (!target.proposal_email_allowed) {
      return Response.json(
        { error: "이 회원은 제안 수신을 받지 않아요." },
        { status: 403 },
      );
    }

    // 차단 관계 검사(양방향).
    const { data: blocks } = await admin
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_profile_id.eq.${me.profile.id},blocked_profile_id.eq.${target.id}),and(blocker_profile_id.eq.${target.id},blocked_profile_id.eq.${me.profile.id})`,
      )
      .limit(1);
    if ((blocks ?? []).length > 0) {
      return Response.json({ error: "연락할 수 없는 회원이에요." }, { status: 403 });
    }

    // rate limit: 1일 5건(proposal_email_click 이벤트 카운트 기준).
    const cohortHash = makeCohortHash(me.userId);
    const rate = await checkDailyLimit({
      cohortHash,
      eventType: "proposal_email_click",
      limit: 5,
    });
    if (!rate.ok) {
      return Response.json(
        { error: "오늘 보낼 수 있는 제안 횟수를 모두 사용했어요(1일 5건)." },
        { status: 429 },
      );
    }

    // 서버 중계 발송(실제 이메일은 서버에서만 조회·사용).
    const result = await sendProposalEmail({
      toProfileId: target.id,
      toUserId: target.user_id,
      fromName: me.profile.name,
      message,
    });

    if (result.status === "failed") {
      return Response.json(
        { error: "제안 전송에 실패했어요. 잠시 후 다시 시도해주세요." },
        { status: 502 },
      );
    }

    // 이벤트 기록(클릭/전송) — rate limit 카운팅에도 사용.
    try {
      await recordEvent({
        eventType: "proposal_email_click",
        cohortHash,
        profileId: me.profile.id,
        targetId: target.id,
      });
    } catch (e) {
      console.error("[proposal] event 기록 실패", e);
    }

    // 수신자에게 인앱 알림(인박스/벨). 발신자 프로필로 이동 링크.
    await createInAppNotification({
      profileId: target.id,
      type: "proposal",
      title: "새 제안이 도착했어요",
      message: `${me.profile.name} 님이 제안을 보냈어요.`,
      link: `/alumni/${me.profile.id}`,
    });

    // status==='skipped'(RESEND 미설정) 도 사용자에겐 접수 완료로 응답(개발환경).
    return Response.json({ ok: true });
  },
  { role: "member" },
);
