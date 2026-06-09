import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicUrl } from "@/lib/storage";
import type { AuthContext } from "@/lib/guards/withAuth";
import type { ArticleRow, ProfileRow } from "@/types/database";
import type { ArticleDetail, ArticleListItem } from "@/lib/content/types";

/**
 * 회원 콘텐츠 열람용 서버 조회 (§6.6 / Phase 3).
 * 열람은 로그인 회원으로 제한(호출부 requireMember 가드 필수). 공개(published)만 노출.
 * service_role(admin)로 서버에서만 호출.
 */

/** 공개 콘텐츠 목록(최신순). limit 으로 미리보기용 소량 조회 가능. */
export async function listPublishedArticles(
  limit = 100,
): Promise<ArticleListItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select("id,title,summary,cover_path,tags,status,created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[content] 목록 조회 실패: ${error.message}`);

  return (
    (data ?? []) as Array<
      Pick<
        ArticleRow,
        "id" | "title" | "summary" | "cover_path" | "tags" | "status" | "created_at"
      >
    >
  ).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    cover_url: a.cover_path ? getPublicUrl(a.cover_path) : null,
    tags: a.tags ?? [],
    status: a.status,
    created_at: a.created_at,
  }));
}

export type ArticleDetailResult =
  | { kind: "ok"; article: ArticleDetail }
  | { kind: "not_found" };

/**
 * 공개 콘텐츠 단건 + (있으면) 관련 동문(공개·활성일 때만 안전 노출).
 * 타인에게는 published 만, 관리자는 draft/hidden 도 인라인 검수용으로 열람 가능.
 */
export async function getPublishedArticle(
  me: AuthContext,
  id: string,
): Promise<ArticleDetailResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle<ArticleRow>();

  if (error) throw new Error(`[content] 상세 조회 실패: ${error.message}`);
  if (!data) return { kind: "not_found" };
  const visibleToOthers = data.status === "published";
  if (!visibleToOthers && !me.isAdmin) return { kind: "not_found" };

  let related = null as ArticleDetail["related_profile"];
  if (data.related_profile_id) {
    const { data: p } = await admin
      .from("profiles")
      .select("id,name,photo_path,status,is_public")
      .eq("id", data.related_profile_id)
      .maybeSingle<
        Pick<ProfileRow, "id" | "name" | "photo_path" | "status" | "is_public">
      >();
    if (p && p.status === "active" && p.is_public) {
      related = {
        id: p.id,
        name: p.name,
        photo_url: p.photo_path ? getPublicUrl(p.photo_path) : null,
      };
    }
  }

  const article: ArticleDetail = {
    id: data.id,
    title: data.title,
    summary: data.summary,
    cover_url: data.cover_path ? getPublicUrl(data.cover_path) : null,
    tags: data.tags ?? [],
    status: data.status,
    created_at: data.created_at,
    body: data.body,
    related_profile: related,
    updated_at: data.updated_at,
  };
  return { kind: "ok", article };
}
