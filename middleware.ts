import { NextResponse, type NextRequest } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * middleware (§9.4):
 *  1) @supabase/ssr 세션 리프레시(토큰 갱신 → 쿠키 재기록).
 *  2) 라우트 보호:
 *     - 비로그인 사용자가 보호 경로 접근 → /login 으로.
 *     - 로그인했으나 프로필 미생성 사용자 → /onboarding 으로.
 *
 * 주의: middleware 는 Edge 런타임이라 admin(service_role) 클라이언트를 쓰지 않는다.
 * 프로필 존재 여부는 user metadata 의 `has_profile` 플래그로 가볍게 판정한다.
 * (온보딩 완료 시 서버에서 supabase.auth.updateUser({ data: { has_profile: true } }) 로 세팅)
 * 정밀 권한(member/admin/suspended)은 각 서버 핸들러의 withAuth 가 2차로 강제한다.
 */

// 로그인 없이 접근 가능한 공개 경로(접두어 매칭).
const PUBLIC_PATHS = ["/", "/login", "/terms", "/privacy", "/auth"];

// 프로필이 없어도 접근 가능한 경로(온보딩/로그아웃 등).
const ONBOARDING_ALLOWED = ["/onboarding"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

/** base64url → 문자열(Edge 안전, 패딩 보정). */
function b64urlDecode(s: string): string {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/**
 * sb-*-auth-token 쿠키(.0/.1 조각 포함)에서 access token 의 exp(초)를 네트워크 없이 읽는다.
 * 어떤 단계든 파싱 실패 시 null(보수적으로 "판단 불가" → 호출부가 통과 처리; 비로그인과 동일 취급,
 * 보호 데이터는 페이지 가드가 막는다).
 */
function getAccessTokenExp(request: NextRequest): number | null {
  const parts = request.cookies
    .getAll()
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (parts.length === 0) return null;

  try {
    let raw = parts.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) {
      raw = b64urlDecode(raw.slice("base64-".length));
    }
    const session = JSON.parse(raw) as { access_token?: string };
    const jwt = session.access_token;
    if (typeof jwt !== "string") return null;
    const payload = JSON.parse(b64urlDecode(jwt.split(".")[1] ?? "")) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // ① 공개 경로는 Auth 왕복 없이 즉시 통과(세션 리프레시는 보호 경로 진입 시 수행).
  if (isPublicPath(pathname)) {
    return response;
  }

  // ② 링크 프리페치 요청은 "토큰이 아직 유효할 때만" 통과 — 화면당 N회 프리페치 × Auth 왕복 제거.
  //    만료/임박 토큰으로 통과시키면 RSC 렌더 중 토큰 회전이 일어나는데 쿠키 기록이 유실되어
  //    (lib/supabase/server.ts 의 setAll 은 RSC 에서 무시됨) refresh token reuse-detection 에
  //    걸려 강제 로그아웃될 수 있다 → 그 경우엔 폴스루해서 미들웨어가 리프레시(쿠키 기록 가능).
  //    실제 내비게이션 시 미들웨어가 다시 돌고, 페이지의 withAuth 가 2차로 강제한다.
  if (
    request.headers.get("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  ) {
    const exp = getAccessTokenExp(request);
    // 토큰 부재(비로그인 — 페이지 가드가 처리) 또는 60초 이상 유효 → 통과.
    if (exp === null || exp * 1000 - Date.now() > 60_000) {
      return response;
    }
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 세션 리프레시(반드시 getUser 호출로 토큰 갱신 트리거).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 → /login (원래 경로를 next 쿼리로 보존)
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 로그인했으나 프로필 미생성 → /onboarding
  const hasProfile = Boolean(user.user_metadata?.has_profile);
  const isOnboardingPath = ONBOARDING_ALLOWED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!hasProfile && !isOnboardingPath) {
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding";
    return NextResponse.redirect(onboardingUrl);
  }

  // 이미 프로필 있는데 온보딩 페이지로 오면 홈으로.
  if (hasProfile && isOnboardingPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // 정적 파일/이미지/파비콘 제외. api 는 각 핸들러 withAuth 가 처리하므로 제외.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
