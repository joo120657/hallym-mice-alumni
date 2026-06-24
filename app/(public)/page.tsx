import { Hero } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { StatsTeaser } from "@/components/landing/StatsTeaser";
import { DirectoryPreview } from "@/components/landing/DirectoryPreview";
import { FeatureSections } from "@/components/landing/FeatureSections";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 랜딩 (§11.1) — 블랙 캔버스 에디토리얼 쇼케이스.
 * 자체 다크 테마(앱 라이트 토큰과 분리). 카운트는 서버에서 집계(PII 없음, 수치만).
 *
 * ISR 60초: 정적 캐시 히트(빠름)를 유지하면서 카운트가 배포 시점에 동결되지 않게
 * 백그라운드 재집계. force-dynamic 으로 바꾸지 말 것(매 요청 DB 3왕복으로 역행).
 */
export const revalidate = 60;

async function getCounts() {
  try {
    const admin = createAdminClient();
    const [a, j, ar] = await Promise.all([
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("is_public", true),
      admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      admin
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    ]);
    return { alumni: a.count ?? 0, jobs: j.count ?? 0, articles: ar.count ?? 0 };
  } catch {
    return { alumni: 0, jobs: 0, articles: 0 };
  }
}

const MARQUEE = [
  "동문 찾기",
  "커피챗",
  "오픈카톡",
  "구인구직",
  "동문 인터뷰",
  "네트워킹",
  "기수",
  "분야 태그",
];

export default async function LandingPage() {
  const counts = await getCounts();

  return (
    <main className="bg-black text-white">
      <Hero />
      <div className="border-y border-white/10 bg-black py-6">
        <Marquee items={MARQUEE} />
      </div>
      <StatsTeaser counts={counts} />
      <DirectoryPreview />
      <FeatureSections />
      <LandingCTA />
      <LandingFooter />
    </main>
  );
}
