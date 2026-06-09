import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSearchTerm } from "@/lib/search";
import type { AuthContext } from "@/lib/guards/withAuth";
import type { JobRow, JobType, TagRow } from "@/types/database";
import type {
  JobAuthor,
  JobDetail,
  JobListItem,
  JobListResult,
} from "@/lib/jobs/types";

/**
 * 구인구직 조회 서버 헬퍼 (§6.4 / Phase 2). admin 클라이언트로만 동작.
 * 디렉토리 쿼리(lib/profile/queries.ts)와 동일한 offset 커서·count 패턴을 따른다.
 */

export interface JobFilters {
  q?: string;
  jobType?: JobType;
  tagId?: string;
  cursor?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const LIST_COLS =
  "id,author_id,title,organization,job_type,location,deadline,compensation,status,created_at";

/** 게시중 공고 목록/검색. status='published' 만. */
export async function listPublishedJobs(
  me: AuthContext,
  filters: JobFilters,
): Promise<JobListResult> {
  const admin = createAdminClient();
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, 50);
  const offset = filters.cursor ?? 0;

  let query = admin
    .from("jobs")
    .select(LIST_COLS, { count: "exact" })
    .eq("status", "published");

  if (filters.tagId) {
    const { data: tagRows } = await admin
      .from("job_tags")
      .select("job_id")
      .eq("tag_id", filters.tagId);
    const ids = (tagRows ?? []).map((r) => r.job_id);
    if (ids.length === 0) return { items: [], nextCursor: null, total: 0 };
    query = query.in("id", ids);
  }
  if (filters.q) {
    const term = `%${sanitizeSearchTerm(filters.q)}%`;
    query = query.or(`title.ilike.${term},organization.ilike.${term}`);
  }
  if (filters.jobType) {
    query = query.eq("job_type", filters.jobType);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`[jobs] 목록 조회 실패: ${error.message}`);

  const rows = (data ?? []) as Array<
    Pick<
      JobRow,
      | "id"
      | "author_id"
      | "title"
      | "organization"
      | "job_type"
      | "location"
      | "deadline"
      | "compensation"
      | "status"
      | "created_at"
    >
  >;
  const items = await shapeJobList(me, rows);

  const hasMore = items.length === limit;
  return {
    items,
    nextCursor: hasMore ? offset + limit : null,
    total: count ?? null,
  };
}

export type JobDetailResult =
  | { kind: "ok"; job: JobDetail }
  | { kind: "not_found" };

/** 공고 상세. 타인에게는 published/closed 만, 작성자/관리자는 모든 상태 열람 가능. */
export async function getPublishedJob(
  me: AuthContext,
  jobId: string,
): Promise<JobDetailResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle<JobRow>();

  if (error) throw new Error(`[jobs] 상세 조회 실패: ${error.message}`);
  if (!data) return { kind: "not_found" };

  const isAuthor = data.author_id === me.profile.id;
  const visibleToOthers = data.status === "published" || data.status === "closed";
  if (!visibleToOthers && !isAuthor && !me.isAdmin) {
    return { kind: "not_found" };
  }

  const [tagMap, authorMap, bookmarked] = await Promise.all([
    fetchJobTags([data.id]),
    fetchAuthors(data.author_id ? [data.author_id] : []),
    fetchBookmarkedSet(me.profile.id, [data.id]),
  ]);

  const job: JobDetail = {
    id: data.id,
    title: data.title,
    organization: data.organization,
    job_type: data.job_type,
    location: data.location,
    deadline: data.deadline,
    compensation: data.compensation,
    status: data.status,
    created_at: data.created_at,
    tags: tagMap.get(data.id) ?? [],
    author: data.author_id ? authorMap.get(data.author_id) ?? null : null,
    is_bookmarked: bookmarked.has(data.id),
    description: data.description,
    requirements: data.requirements,
    apply_url: data.apply_url,
    contact: data.contact,
    updated_at: data.updated_at,
    is_author: isAuthor,
  };
  return { kind: "ok", job };
}

/** 내가 올린 공고(모든 상태) — 관리/수정용. */
export async function listMyJobs(me: AuthContext): Promise<JobListItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("jobs")
    .select(LIST_COLS)
    .eq("author_id", me.profile.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  return shapeJobList(me, (data ?? []) as never);
}

/** 내가 북마크한 공고(게시중/마감) — 최신 북마크 순. */
export async function listBookmarkedJobs(me: AuthContext): Promise<JobListItem[]> {
  const admin = createAdminClient();
  const { data: bms } = await admin
    .from("job_bookmarks")
    .select("job_id")
    .eq("profile_id", me.profile.id)
    .order("created_at", { ascending: false });

  const orderedIds = (bms ?? []).map((b) => b.job_id);
  if (orderedIds.length === 0) return [];

  const { data } = await admin
    .from("jobs")
    .select(LIST_COLS)
    .in("id", orderedIds)
    .in("status", ["published", "closed"]);

  const items = await shapeJobList(me, (data ?? []) as never);
  // 북마크 최신 순서 유지.
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  return items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

type JobListRow = Pick<
  JobRow,
  | "id"
  | "author_id"
  | "title"
  | "organization"
  | "job_type"
  | "location"
  | "deadline"
  | "compensation"
  | "status"
  | "created_at"
>;

async function shapeJobList(
  me: AuthContext,
  rows: JobListRow[],
): Promise<JobListItem[]> {
  if (rows.length === 0) return [];
  const jobIds = rows.map((r) => r.id);
  const authorIds = rows
    .map((r) => r.author_id)
    .filter((v): v is string => Boolean(v));

  const [tagMap, authorMap, bookmarked] = await Promise.all([
    fetchJobTags(jobIds),
    fetchAuthors(authorIds),
    fetchBookmarkedSet(me.profile.id, jobIds),
  ]);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    organization: r.organization,
    job_type: r.job_type,
    location: r.location,
    deadline: r.deadline,
    compensation: r.compensation,
    status: r.status,
    created_at: r.created_at,
    tags: tagMap.get(r.id) ?? [],
    author: r.author_id ? authorMap.get(r.author_id) ?? null : null,
    is_bookmarked: bookmarked.has(r.id),
  }));
}

async function fetchJobTags(jobIds: string[]): Promise<Map<string, TagRow[]>> {
  const map = new Map<string, TagRow[]>();
  if (jobIds.length === 0) return map;
  const admin = createAdminClient();
  const { data } = await admin
    .from("job_tags")
    .select("job_id, tags(id,name,category)")
    .in("job_id", jobIds);
  for (const row of (data ?? []) as Array<{
    job_id: string;
    tags: TagRow | TagRow[] | null;
  }>) {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
    if (!tag) continue;
    const list = map.get(row.job_id) ?? [];
    list.push(tag);
    map.set(row.job_id, list);
  }
  return map;
}

async function fetchAuthors(ids: string[]): Promise<Map<string, JobAuthor>> {
  const map = new Map<string, JobAuthor>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id,name").in("id", unique);
  for (const p of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(p.id, { id: p.id, name: p.name });
  }
  return map;
}

async function fetchBookmarkedSet(
  meProfileId: string,
  jobIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (jobIds.length === 0) return set;
  const admin = createAdminClient();
  const { data } = await admin
    .from("job_bookmarks")
    .select("job_id")
    .eq("profile_id", meProfileId)
    .in("job_id", jobIds);
  for (const b of (data ?? []) as Array<{ job_id: string }>) set.add(b.job_id);
  return set;
}
