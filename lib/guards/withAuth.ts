import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import type { ProfileRow } from "@/types/database";

/**
 * 서버 권한 가드 (§7.4).
 *
 *  Role:
 *   - 'any'    : 로그인만 요구(status 무관). 거의 쓰지 않는다.
 *   - 'member' : 로그인 + profiles.status === 'active'. (가입자 = 풀 사용)
 *   - 'admin'  : member 조건 + (ADMIN_EMAILS 부트스트랩 || admins 테이블).
 *
 *  member = 세션 있음 + profiles.status === 'active' (suspended/withdrawn 차단).
 *  verified 게이트는 존재하지 않는다(is_verified 는 비차단 배지일 뿐).
 *
 *  모든 Route Handler / Server Action 은 withAuth 로 감싼다.
 *  감싸지 않으면 데이터(admin 클라이언트)에 닿지 않는 것이 기본값이다.
 */

export type Role = "any" | "member" | "admin";

/** 가드를 통과한 호출자 컨텍스트. 핸들러에 이것만 전달한다. */
export interface AuthContext {
  /** Supabase auth.users 의 user id */
  userId: string;
  email: string | null;
  profile: ProfileRow;
  isAdmin: boolean;
}

export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

/** 표준 JSON 에러 응답 빌더(Route Handler 용). */
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * 인증 데이터 조회(역할 검사 없음) — React cache() 로 **요청 단위 메모이즈**.
 * 레이아웃·페이지·generateMetadata 가 같은 요청에서 각자 호출해도 실제 조회는 1회.
 * (이전엔 레이아웃+페이지가 각각 3왕복 = 6왕복이었음.)
 *
 * 미로그인 → null. 프로필 미생성 → AuthError(403).
 */
const loadAuth = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // profiles + admins 멤버십을 한 왕복으로 조회.
  // admins 는 profiles 를 참조하는 FK 가 2개(profile_id, granted_by)라 관계를 명시한다.
  const admin = createAdminClient();
  // profile_id 가 unique(0001_init.sql)라 PostgREST 가 1:1 로 인식 → admins 는 객체 또는 null.
  // 주의: 이 판정은 그 unique 제약에 의존한다. 아래에서 배열 형태도 런타임 정규화해
  // 스키마 변화 시 "[] !== null → 전원 admin" 같은 권한 상승이 불가능하게 한다.
  const { data, error } = await admin
    .from("profiles")
    .select("*, admins!admins_profile_id_fkey(id)")
    .eq("user_id", user.id)
    .maybeSingle<
      ProfileRow & { admins: { id: string } | Array<{ id: string }> | null }
    >();

  if (error) {
    throw new AuthError(403, "프로필 조회에 실패했습니다.");
  }
  if (!data) {
    // 로그인은 했으나 프로필 미생성(온보딩 미완료).
    throw new AuthError(403, "프로필이 없습니다. 온보딩을 완료해주세요.");
  }

  const { admins, ...profile } = data;
  const email = user.email ?? null;
  const env = getServerEnv();
  // 객체/배열/null 어느 형태든 "행이 실제로 존재할 때만" 관리자로 판정(런타임 정규화).
  const hasAdminRow = Array.isArray(admins) ? admins.length > 0 : admins != null;
  const isAdmin =
    (email !== null && env.adminEmails.includes(email.toLowerCase())) ||
    hasAdminRow;

  return { userId: user.id, email, profile: profile as ProfileRow, isAdmin };
});

/**
 * 현재 세션 → profiles → 권한 판정을 수행하고 AuthContext 를 반환한다.
 * 실패 시 AuthError(401/403)를 throw 한다.
 *
 * Server Action 등 raw 컨텍스트가 필요할 때 직접 호출할 수 있다.
 * 데이터 조회는 loadAuth(요청 단위 캐시)가 담당하고 여기선 역할 검사만 한다.
 */
export async function resolveAuth(role: Role): Promise<AuthContext> {
  const ctx = await loadAuth();
  if (!ctx) {
    throw new AuthError(401, "로그인이 필요합니다.");
  }

  // member / admin 은 active 상태를 요구한다(suspended/withdrawn 차단).
  if (role !== "any" && ctx.profile.status !== "active") {
    throw new AuthError(403, "이용이 제한된 계정입니다.");
  }
  if (role === "admin" && !ctx.isAdmin) {
    throw new AuthError(403, "관리자 권한이 필요합니다.");
  }

  return ctx;
}

/**
 * Route Handler 래퍼.
 *
 *   export const POST = withAuth(async (req, ctx) => { ... }, { role: 'member' });
 *   // 동적 세그먼트: 제네릭에 "해결된 params 모양"을 준다(Promise 로 감싸지 않는다).
 *   export const GET  = withAuth<{ id: string }>(async (req, { me, params }) => {
 *     const { id } = await params;   // Next 15: params 는 Promise → await
 *   }, { role: 'admin' });
 *
 * 핸들러에는 검증을 통과한 AuthContext(me) 와 라우트 params(Promise) 가 전달된다.
 *
 * 반환 함수 시그니처는 Next 15 의 Route Handler 규약(`RouteContext`: `{ params: Promise<…> }`)과
 * 호환된다. 동적 세그먼트가 없는 라우트는 제네릭을 생략하고 params 를 무시하면 된다.
 */
export function withAuth<Ctx = Record<string, never>>(
  handler: (
    req: Request,
    ctx: { me: AuthContext; params: Promise<Ctx> },
  ) => Promise<Response> | Response,
  opts: { role: Role },
) {
  return async (
    req: Request,
    routeCtx: { params: Promise<Ctx> },
  ): Promise<Response> => {
    let me: AuthContext;
    try {
      me = await resolveAuth(opts.role);
    } catch (err) {
      if (err instanceof AuthError) {
        return jsonError(err.status, err.message);
      }
      return jsonError(500, "권한 확인 중 오류가 발생했습니다.");
    }
    return handler(req, { me, params: routeCtx?.params });
  };
}
