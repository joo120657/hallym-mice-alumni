import { withAuth } from "@/lib/guards/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobInputSchema } from "@/lib/validators";
import type { JobRow } from "@/types/database";

/**
 * PATCH  /api/jobs/:id — 공고 수정(작성자/관리자) 또는 마감(action:"close").
 * DELETE /api/jobs/:id — 공고 삭제(작성자/관리자). job_tags/job_bookmarks 는 cascade.
 *
 * 정책: 승인된 회원의 공고 수정은 재승인 없이 게시 상태를 유지한다.
 *       (관리자 수정은 상태 유지). status 직접 변경은 입력 스키마에 없다.
 */
type Params = { id: string };

export const PATCH = withAuth<Params>(
  async (req, { me, params }) => {
    const id = await resolveId(params);
    if (!id) return Response.json({ error: "잘못된 경로예요." }, { status: 400 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "잘못된 요청 본문이에요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: loadErr } = await admin
      .from("jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle<JobRow>();
    if (loadErr || !existing) {
      return Response.json({ error: "공고를 찾을 수 없어요." }, { status: 404 });
    }

    const isAuthor = existing.author_id === me.profile.id;
    if (!isAuthor && !me.isAdmin) {
      return Response.json({ error: "권한이 없어요." }, { status: 403 });
    }

    // 작성자/관리자 마감 처리.
    if ((body as { action?: unknown })?.action === "close") {
      const { error } = await admin
        .from("jobs")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        return Response.json({ error: "마감에 실패했어요." }, { status: 500 });
      }
      return Response.json({ ok: true });
    }

    const parsed = jobInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const update: Partial<JobRow> = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.organization !== undefined) update.organization = input.organization;
    if (input.job_type !== undefined) update.job_type = input.job_type;
    if (input.location !== undefined) update.location = input.location ?? null;
    if (input.deadline !== undefined) update.deadline = input.deadline ?? null;
    if (input.compensation !== undefined)
      update.compensation = input.compensation ?? null;
    if (input.description !== undefined) update.description = input.description;
    if (input.requirements !== undefined)
      update.requirements = input.requirements ?? null;
    if (input.apply_url !== undefined) update.apply_url = input.apply_url ?? null;
    if (input.contact !== undefined) update.contact = input.contact ?? null;

    // 승인된 작성자가 게시중/대기 공고를 고치면 재승인 없이 게시 상태를 유지한다.
    if (!me.isAdmin && (existing.status === "published" || existing.status === "pending")) {
      update.status = "published";
    }
    update.updated_at = new Date().toISOString();

    const { error } = await admin.from("jobs").update(update).eq("id", id);
    if (error) {
      return Response.json({ error: "공고 수정에 실패했어요." }, { status: 500 });
    }

    // 태그가 전달되면 전체 교체.
    if (input.tag_ids !== undefined) {
      await admin.from("job_tags").delete().eq("job_id", id);
      if (input.tag_ids.length) {
        await admin
          .from("job_tags")
          .insert(input.tag_ids.map((tag_id) => ({ job_id: id, tag_id })));
      }
    }

    return Response.json({ ok: true });
  },
  { role: "member" },
);

export const DELETE = withAuth<Params>(
  async (_req, { me, params }) => {
    const id = await resolveId(params);
    if (!id) return Response.json({ error: "잘못된 경로예요." }, { status: 400 });

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("jobs")
      .select("id, author_id")
      .eq("id", id)
      .maybeSingle<Pick<JobRow, "id" | "author_id">>();
    if (!existing) {
      return Response.json({ error: "공고를 찾을 수 없어요." }, { status: 404 });
    }
    if (existing.author_id !== me.profile.id && !me.isAdmin) {
      return Response.json({ error: "권한이 없어요." }, { status: 403 });
    }

    const { error } = await admin.from("jobs").delete().eq("id", id);
    if (error) {
      return Response.json({ error: "공고 삭제에 실패했어요." }, { status: 500 });
    }
    return Response.json({ ok: true });
  },
  { role: "member" },
);

async function resolveId(
  params: Promise<Params> | undefined,
): Promise<string | null> {
  if (!params) return null;
  const resolved = await params;
  return resolved?.id ?? null;
}
