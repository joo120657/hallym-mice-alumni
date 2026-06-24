import { withAuth } from "@/lib/guards/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobInputSchema } from "@/lib/validators";
import { listPublishedJobs } from "@/lib/jobs/queries";
import type { JobType } from "@/types/database";

/**
 * GET  /api/jobs — 게시중 공고 목록/검색 (§6.4). 회원(active)만.
 * POST /api/jobs — 공고 등록. 작성자=본인, 승인된 회원은 즉시 게시.
 *
 * 쿼리: q, type(job_type), tag, cursor
 */
export const GET = withAuth(
  async (req, { me }) => {
    const sp = new URL(req.url).searchParams;
    const typeRaw = sp.get("type")?.trim();
    const cursorRaw = sp.get("cursor");

    try {
      const result = await listPublishedJobs(me, {
        q: sp.get("q")?.trim() || undefined,
        jobType: (typeRaw || undefined) as JobType | undefined,
        tagId: sp.get("tag")?.trim() || undefined,
        cursor: cursorRaw ? Number(cursorRaw) : undefined,
      });
      return Response.json(result);
    } catch (e) {
      console.error("[GET /api/jobs]", e);
      return Response.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
    }
  },
  { role: "member" },
);

export const POST = withAuth(
  async (req, { me }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
    }

    const parsed = jobInputSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jobs")
      .insert({
        author_id: me.profile.id,
        title: input.title,
        organization: input.organization,
        job_type: input.job_type,
        location: input.location ?? null,
        deadline: input.deadline ?? null,
        compensation: input.compensation ?? null,
        description: input.description,
        requirements: input.requirements ?? null,
        apply_url: input.apply_url ?? null,
        contact: input.contact ?? null,
        status: "published",
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      console.error("[POST /api/jobs]", error);
      return Response.json({ error: "공고 등록에 실패했어요." }, { status: 500 });
    }

    if (input.tag_ids?.length) {
      await admin
        .from("job_tags")
        .insert(input.tag_ids.map((tag_id) => ({ job_id: data.id, tag_id })));
    }

    return Response.json({ id: data.id }, { status: 201 });
  },
  { role: "member" },
);
