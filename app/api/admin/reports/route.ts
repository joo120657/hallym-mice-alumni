import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminLog } from "@/lib/admin/log";
import { withAuth } from "@/lib/guards/withAuth";
import { reportStatusSchema } from "@/lib/validators";
import type { ProfileRow, ReportRow } from "@/types/database";

/**
 * 신고 관리 API (T-302 / §6.7).
 *
 * GET  /api/admin/reports?status=open  → 신고 큐 목록(상태 필터).
 * PATCH /api/admin/reports             → 신고 처리(상태 전이) + 선택 액션(대상 숨김 / 회원 정지).
 *
 * 상태머신: open → reviewing → resolved / dismissed.
 * 액션:
 *   - hide   : 대상 숨김(profile=is_public false, job/article=status 'hidden').
 *   - suspend: 신고 대상이 회원(profile)이면 status='suspended'.
 * 모든 처리는 admin_logs 에 기록한다(§6.7 완료 기준).
 */

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");

    const admin = createAdminClient();
    let query = admin
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusParam && statusParam !== "all") {
      const parsed = reportStatusSchema.safeParse(statusParam);
      if (!parsed.success) {
        return Response.json({ error: "잘못된 상태 필터예요." }, { status: 400 });
      }
      query = query.eq("status", parsed.data);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "신고 목록 조회에 실패했어요." }, { status: 500 });
    }

    const reports = (data ?? []) as ReportRow[];

    // 신고 대상이 profile 인 경우 표시용으로 이름/상태/공개여부를 함께 첨부한다.
    const profileIds = reports
      .filter((r) => r.target_type === "profile")
      .map((r) => r.target_id);

    const targetMap = new Map<
      string,
      Pick<ProfileRow, "id" | "name" | "status" | "is_public">
    >();
    if (profileIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name, status, is_public")
        .in("id", profileIds);
      for (const p of profiles ?? []) {
        targetMap.set(p.id, p);
      }
    }

    // job/article 신고는 제목을 함께 첨부(관리자가 무엇을 숨기는지 확인 가능하게).
    const titleMap = new Map<string, string>();
    const jobIds = reports
      .filter((r) => r.target_type === "job")
      .map((r) => r.target_id);
    const articleIds = reports
      .filter((r) => r.target_type === "article")
      .map((r) => r.target_id);
    if (jobIds.length > 0) {
      const { data: jobs } = await admin
        .from("jobs")
        .select("id, title")
        .in("id", jobIds);
      for (const j of (jobs ?? []) as Array<{ id: string; title: string }>)
        titleMap.set(j.id, j.title);
    }
    if (articleIds.length > 0) {
      const { data: arts } = await admin
        .from("articles")
        .select("id, title")
        .in("id", articleIds);
      for (const a of (arts ?? []) as Array<{ id: string; title: string }>)
        titleMap.set(a.id, a.title);
    }

    return Response.json({
      reports: reports.map((r) => ({
        ...r,
        target_profile: targetMap.get(r.target_id) ?? null,
        target_title:
          r.target_type !== "profile" ? titleMap.get(r.target_id) ?? null : null,
      })),
    });
  },
  { role: "admin" },
);

export const PATCH = withAuth(
  async (req, { me }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "잘못된 요청 본문이에요." }, { status: 400 });
    }

    const { reportId, status, action } = (body ?? {}) as {
      reportId?: unknown;
      status?: unknown;
      action?: unknown;
    };

    if (typeof reportId !== "string" || !reportId) {
      return Response.json({ error: "reportId 가 필요해요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: report, error: loadErr } = await admin
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle<ReportRow>();

    if (loadErr || !report) {
      return Response.json({ error: "신고를 찾을 수 없어요." }, { status: 404 });
    }

    // 1) 상태 전이(선택).
    let newStatus = report.status;
    if (status !== undefined) {
      const parsed = reportStatusSchema.safeParse(status);
      if (!parsed.success) {
        return Response.json({ error: "잘못된 상태값이에요." }, { status: 400 });
      }
      newStatus = parsed.data;
      const { error: updErr } = await admin
        .from("reports")
        .update({ status: newStatus, handled_by: me.profile.id })
        .eq("id", reportId);
      if (updErr) {
        return Response.json({ error: "신고 상태 변경에 실패했어요." }, { status: 500 });
      }
      await recordAdminLog({
        adminProfileId: me.profile.id,
        action: "report_status_change",
        targetType: "report",
        targetId: reportId,
        detail: { from: report.status, to: newStatus },
      });
    }

    // 2) 대상 숨김(선택).
    if (action === "hide" || action === "suspend") {
      const result = await applyTargetAction(
        admin,
        report.target_type,
        report.target_id,
        action,
        me.profile.id,
      );
      if (!result.ok) {
        return Response.json({ error: result.message }, { status: result.status });
      }
    }

    return Response.json({ ok: true, status: newStatus });
  },
  { role: "admin" },
);

type AdminClient = ReturnType<typeof createAdminClient>;

async function applyTargetAction(
  admin: AdminClient,
  targetType: ReportRow["target_type"],
  targetId: string,
  action: "hide" | "suspend",
  adminProfileId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (action === "suspend") {
    if (targetType !== "profile") {
      return {
        ok: false,
        status: 400,
        message: "정지는 회원(profile) 신고에만 적용할 수 있어요.",
      };
    }
    const { error } = await admin
      .from("profiles")
      .update({ status: "suspended" })
      .eq("id", targetId);
    if (error) {
      return { ok: false, status: 500, message: "회원 정지에 실패했어요." };
    }
    await recordAdminLog({
      adminProfileId,
      action: "profile_suspend",
      targetType: "profile",
      targetId,
      detail: { via: "report" },
    });
    return { ok: true };
  }

  // action === "hide"
  if (targetType === "profile") {
    const { error } = await admin
      .from("profiles")
      .update({ is_public: false })
      .eq("id", targetId);
    if (error) {
      return { ok: false, status: 500, message: "프로필 숨김에 실패했어요." };
    }
  } else {
    // job / article — status 컬럼을 'hidden' 으로.
    const table = targetType === "job" ? "jobs" : "articles";
    const { error } = await admin
      .from(table)
      .update({ status: "hidden" })
      .eq("id", targetId);
    if (error) {
      return { ok: false, status: 500, message: "콘텐츠 숨김에 실패했어요." };
    }
  }
  await recordAdminLog({
    adminProfileId,
    action: "target_hide",
    targetType,
    targetId,
    detail: { via: "report" },
  });
  return { ok: true };
}
