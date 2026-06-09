import { withAuth } from "@/lib/guards/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { blockSchema } from "@/lib/validators";

/**
 * POST   /api/blocks — 차단 (§6.3-4 / T-205).
 * DELETE /api/blocks — 차단 해제.
 *
 * 차단하면 내 프로필이 상대에게 숨겨지고(디렉토리 queries 가 양방향 제외),
 * 상대→나 / 나→상대 제안 중계도 차단된다(proposal route 검사).
 */
/** GET /api/blocks — 내가 차단한 회원 목록(차단 해제 UI용). */
export const GET = withAuth(
  async (_req, { me }) => {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("blocks")
      .select("blocked_profile_id")
      .eq("blocker_profile_id", me.profile.id);
    const ids = (rows ?? []).map((r) => r.blocked_profile_id);
    if (ids.length === 0) return Response.json({ blocked: [] });

    const { data: profiles } = await admin
      .from("profiles")
      .select("id,name")
      .in("id", ids);
    return Response.json({
      blocked: (profiles ?? []).map((p) => ({ id: p.id, name: p.name })),
    });
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

    const parsed = blockSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "잘못된 요청이에요." }, { status: 422 });
    }
    const target = parsed.data.target_profile_id;
    if (target === me.profile.id) {
      return Response.json({ error: "본인은 차단할 수 없어요." }, { status: 400 });
    }

    const admin = createAdminClient();
    // 대상 존재 확인.
    const { data: exists } = await admin
      .from("profiles")
      .select("id")
      .eq("id", target)
      .maybeSingle();
    if (!exists) {
      return Response.json({ error: "대상을 찾을 수 없어요." }, { status: 404 });
    }

    const { error } = await admin
      .from("blocks")
      .upsert(
        { blocker_profile_id: me.profile.id, blocked_profile_id: target },
        { onConflict: "blocker_profile_id,blocked_profile_id", ignoreDuplicates: true },
      );

    if (error) {
      console.error("[POST /api/blocks]", error);
      return Response.json({ error: "차단에 실패했어요." }, { status: 500 });
    }
    return Response.json({ ok: true });
  },
  { role: "member" },
);

export const DELETE = withAuth(
  async (req, { me }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
    }
    const parsed = blockSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "잘못된 요청이에요." }, { status: 422 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("blocks")
      .delete()
      .eq("blocker_profile_id", me.profile.id)
      .eq("blocked_profile_id", parsed.data.target_profile_id);

    if (error) {
      console.error("[DELETE /api/blocks]", error);
      return Response.json({ error: "차단 해제에 실패했어요." }, { status: 500 });
    }
    return Response.json({ ok: true });
  },
  { role: "member" },
);
