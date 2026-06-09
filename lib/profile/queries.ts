import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicUrl } from "@/lib/storage";
import { sanitizeSearchTerm } from "@/lib/search";
import {
  toProfileCard,
  toProfileDetail,
  type PublicProfileCard,
  type PublicProfileDetail,
} from "@/lib/profile/visibility";
import type { AuthContext } from "@/lib/guards/withAuth";
import type { ProfileRow, TagRow } from "@/types/database";

/**
 * 프로필 조회 서버 헬퍼 (§6.2 / §13.3). admin 클라이언트로만 동작.
 * 모든 결과는 visibility 모듈을 거쳐 직렬화한다(오픈카톡/학번/이메일 마스킹).
 */

export interface DirectoryFilters {
  q?: string; // 이름/회사/직무 부분일치(pg_trgm ILIKE)
  organization?: string;
  position?: string;
  tagId?: string;
  graduationYear?: number;
  coffeechatOpen?: boolean; // 커피챗 "가능/월1회" 만
  cursor?: number; // offset 기반 페이지네이션
  limit?: number;
}

export interface DirectoryResult {
  items: PublicProfileCard[];
  nextCursor: number | null;
  total: number | null;
}

const DEFAULT_LIMIT = 20;

/** 디렉토리 목록/검색. 차단 관계·비공개·비활성·탈퇴는 제외한다. */
export async function listDirectory(
  me: AuthContext,
  filters: DirectoryFilters,
): Promise<DirectoryResult> {
  const admin = createAdminClient();
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, 50);
  const offset = filters.cursor ?? 0;

  // 나를 차단한 사용자의 프로필은 내게 숨긴다(§6.3-4).
  const blockedMe = await fetchBlockedMeIds(me.profile.id);

  let query = admin
    .from("profiles")
    .select(
      "id,user_id,name,role,status,is_verified,student_number,admission_year,graduation_year,department,organization,employment_status,position,bio,career_summary,coffeechat_status,open_kakao_url,proposal_email_allowed,photo_path,is_public,field_visibility,deleted_at,anonymized_at,created_at,updated_at",
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("is_public", true)
    .is("deleted_at", null);

  if (blockedMe.length > 0) {
    query = query.not("id", "in", `(${blockedMe.join(",")})`);
  }

  // 태그 필터: 먼저 profile_tags 에서 대상 profile_id 집합을 구한다.
  if (filters.tagId) {
    const { data: tagRows } = await admin
      .from("profile_tags")
      .select("profile_id")
      .eq("tag_id", filters.tagId);
    const ids = (tagRows ?? []).map((r) => r.profile_id);
    if (ids.length === 0) {
      return { items: [], nextCursor: null, total: 0 };
    }
    query = query.in("id", ids);
  }

  if (filters.q) {
    const term = `%${sanitizeSearchTerm(filters.q)}%`;
    query = query.or(
      `name.ilike.${term},organization.ilike.${term},position.ilike.${term}`,
    );
  }
  if (filters.organization) {
    query = query.ilike("organization", `%${filters.organization}%`);
  }
  if (filters.position) {
    query = query.ilike("position", `%${filters.position}%`);
  }
  if (filters.graduationYear) {
    query = query.eq("graduation_year", filters.graduationYear);
  }
  if (filters.coffeechatOpen) {
    // '커피챗 가능' = open/monthly 만. offer_only(제안만)는 커피챗 거부이므로 제외.
    query = query.in("coffeechat_status", ["open", "monthly"]);
  }

  query = query
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`[directory] 조회 실패: ${error.message}`);
  }

  const rows = (data ?? []) as ProfileRow[];
  const tagMap = await fetchTagsForProfiles(rows.map((r) => r.id));

  const items = rows.map((row) =>
    toProfileCard(row, tagMap.get(row.id) ?? [], {
      isSelf: row.id === me.profile.id,
      toPhotoUrl: getPublicUrl,
    }),
  );

  const hasMore = items.length === limit;
  return {
    items,
    nextCursor: hasMore ? offset + limit : null,
    total: count ?? null,
  };
}

/**
 * 프로필 상세. 없거나 비공개·비활성이면 결과 구분을 반환한다.
 * 차단 관계(내가 상대를 차단 / 상대가 나를 차단)면 'blocked' 로 막는다.
 */
export type ProfileDetailResult =
  | { kind: "ok"; profile: PublicProfileDetail }
  | { kind: "not_found" }
  | { kind: "private" }
  | { kind: "blocked" };

export async function getProfileDetail(
  me: AuthContext,
  profileId: string,
): Promise<ProfileDetailResult> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle<ProfileRow>();

  if (error) throw new Error(`[profile] 조회 실패: ${error.message}`);
  if (!data) return { kind: "not_found" };

  const isSelf = data.id === me.profile.id;

  if (!isSelf) {
    if (data.status !== "active" || data.deleted_at) return { kind: "not_found" };
    if (!data.is_public) return { kind: "private" };

    // 차단 관계 검사(양방향).
    const blocked = await isBlockedBetween(me.profile.id, data.id);
    if (blocked) return { kind: "blocked" };
  }

  const tags = await fetchTagsForProfiles([data.id]);

  const profile = toProfileDetail(data, tags.get(data.id) ?? [], {
    isSelf,
    isAdmin: me.isAdmin,
    viewerRole: me.profile.role,
    toPhotoUrl: getPublicUrl,
  });

  return { kind: "ok", profile };
}

/** profile_tags + tags 조인 → profileId별 TagRow[] 맵. */
async function fetchTagsForProfiles(
  profileIds: string[],
): Promise<Map<string, TagRow[]>> {
  const map = new Map<string, TagRow[]>();
  if (profileIds.length === 0) return map;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profile_tags")
    .select("profile_id, tags(id,name,category)")
    .in("profile_id", profileIds);

  for (const row of (data ?? []) as Array<{
    profile_id: string;
    tags: TagRow | TagRow[] | null;
  }>) {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
    if (!tag) continue;
    const list = map.get(row.profile_id) ?? [];
    list.push(tag);
    map.set(row.profile_id, list);
  }
  return map;
}

/** 내가 차단한 + 나를 차단한 프로필 id 모두(상세 차단 검사용). */
async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("blocks")
    .select("id")
    .or(
      `and(blocker_profile_id.eq.${a},blocked_profile_id.eq.${b}),and(blocker_profile_id.eq.${b},blocked_profile_id.eq.${a})`,
    )
    .limit(1);
  return (data ?? []).length > 0;
}

/** 나를 차단한 사용자들의 profile_id(디렉토리에서 그들의 프로필을 숨김). */
async function fetchBlockedMeIds(meProfileId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("blocks")
    .select("blocker_profile_id, blocked_profile_id")
    .or(`blocker_profile_id.eq.${meProfileId},blocked_profile_id.eq.${meProfileId}`);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    // 내가 차단한 상대 + 나를 차단한 상대 양쪽을 디렉토리에서 숨긴다.
    if (row.blocker_profile_id === meProfileId) ids.add(row.blocked_profile_id);
    if (row.blocked_profile_id === meProfileId) ids.add(row.blocker_profile_id);
  }
  return [...ids];
}
