import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminLog } from "@/lib/admin/log";
import { createInAppNotification } from "@/lib/notifications/create";
import { withAuth } from "@/lib/guards/withAuth";
import { jobStatusSchema } from "@/lib/validators";
import type { JobRow, JobStatus } from "@/types/database";

/**
 * 공고 승인/관리 API (§6.4 / §6.7). 관리자 전용.
 *
 * GET   /api/admin/jobs?status=pending — 승인 대기 큐(기본 pending). 작성자명 첨부.
 * PATCH /api/admin/jobs               — 상태 전이(pending→published / →hidden / →closed).
 * 모든 전이는 admin_logs 기록.
 */
export const GET = withAuth(
  async (req) => {
    const statusParam = new URL(req.url).searchParams.get("status");

    const admin = createAdminClient();
    let query = admin
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusParam && statusParam !== "all") {
      const parsed = jobStatusSchema.safeParse(statusParam);
      if (!parsed.success) {
        return Response.json({ error: "잘못된 상태 필터예요." }, { status: 400 });
      }
      query = query.eq("status", parsed.data);
    } else if (!statusParam) {
      query = query.eq("status", "pending"); // 기본 큐 = 승인 대기.
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "공고 목록 조회에 실패했어요." }, { status: 500 });
    }

    const jobs = (data ?? []) as JobRow[];
    const authorIds = [
      ...new Set(jobs.map((j) => j.author_id).filter((v): v is string => Boolean(v))),
    ];
    const authorMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: ps } = await admin
        .from("profiles")
        .select("id,name")
        .in("id", authorIds);
      for (const p of (ps ?? []) as Array<{ id: string; name: string }>) {
        authorMap.set(p.id, p.name);
      }
    }

    return Response.json({
      jobs: jobs.map((j) => ({
        ...j,
        author_name: j.author_id ? authorMap.get(j.author_id) ?? null : null,
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

    const { jobId, status } = (body ?? {}) as { jobId?: unknown; status?: unknown };
    if (typeof jobId !== "string" || !jobId) {
      return Response.json({ error: "jobId 가 필요해요." }, { status: 400 });
    }
    const parsed = jobStatusSchema.safeParse(status);
    if (!parsed.success) {
      return Response.json({ error: "잘못된 상태값이에요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("jobs")
      .select("id, status, author_id, title")
      .eq("id", jobId)
      .maybeSingle<Pick<JobRow, "id" | "status" | "author_id" | "title">>();
    if (!existing) {
      return Response.json({ error: "공고를 찾을 수 없어요." }, { status: 404 });
    }

    const { error } = await admin
      .from("jobs")
      .update({ status: parsed.data as JobStatus, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) {
      return Response.json({ error: "상태 변경에 실패했어요." }, { status: 500 });
    }

    await recordAdminLog({
      adminProfileId: me.profile.id,
      action: "job_status_change",
      targetType: "job",
      targetId: jobId,
      detail: { from: existing.status, to: parsed.data },
    });

    // 승인(게시)되면 작성자에게 인앱 알림.
    if (
      parsed.data === "published" &&
      existing.status !== "published" &&
      existing.author_id
    ) {
      await createInAppNotification({
        profileId: existing.author_id,
        type: "job_published",
        title: "공고가 게시됐어요",
        message: `"${existing.title}" 공고가 승인되어 게시됐어요.`,
        link: `/jobs/${jobId}`,
      });
    }

    return Response.json({ ok: true, status: parsed.data });
  },
  { role: "admin" },
);
