import Link from "next/link";

import { ChevronRight, Eye, Sparkles, Users } from "lucide-react";

import { ProfileCard } from "@/components/alumni/ProfileCard";
import { JobCard } from "@/components/jobs/JobCard";
import { ArticleCard } from "@/components/content/ArticleCard";
import { AlbumGrid } from "@/components/albums/AlbumGrid";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { requireMemberPage } from "@/lib/guards/page";
import { listDirectory } from "@/lib/profile/queries";
import { listPublishedJobs } from "@/lib/jobs/queries";
import { listPublishedArticles } from "@/lib/content/public";
import { listPublicAlbums } from "@/lib/albums/public";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 홈 — 콘텐츠 허브 (§6.6 / §11).
 * 본인 신호(조회수·기수) + 새로운 기회(공고) + 동문 이야기(콘텐츠) + 추천 동문 + 행사 기록.
 * 단순 추천을 넘어 "볼거리"를 모아 보여준다.
 */
export default async function HomePage() {
  const me = await requireMemberPage("/home");
  const admin = createAdminClient();

  // 6개 쿼리 전부 독립 → 한 번에 병렬 실행(직렬 폭포 제거: 8왕복 → 1단계).
  const [viewRes, cohortRes, directory, jobsRes, articles, albums] =
    await Promise.all([
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "profile_view")
        .eq("target_id", me.profile.id),
      me.profile.graduation_year
        ? admin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
            .eq("is_public", true)
            .eq("graduation_year", me.profile.graduation_year)
            .neq("id", me.profile.id)
        : Promise.resolve({ count: 0 }),
      listDirectory(me, { limit: 6 }),
      listPublishedJobs(me, { limit: 3 }),
      listPublishedArticles(3),
      listPublicAlbums(4),
    ]);
  const viewCount = viewRes.count;
  const cohortNewCount = cohortRes.count ?? 0;

  const recommended = directory.items
    .filter((p) => p.id !== me.profile.id)
    .slice(0, 4);
  const latestJobs = jobsRes.items.slice(0, 3);
  const latestArticles = articles.slice(0, 3);
  const recentAlbums = albums.slice(0, 4);

  return (
    <div className="space-y-9 px-5 py-6">
      <header>
        <p className="text-sm text-muted-foreground">반가워요,</p>
        <h1 className="text-2xl font-bold tracking-tight">{me.profile.name} 님</h1>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat icon={Eye} label="내 프로필 조회" value={viewCount ?? 0} />
          <Stat icon={Users} label="우리 기수 동문" value={cohortNewCount} />
        </div>
      </header>

      {latestJobs.length > 0 ? (
        <Section title="새로운 기회" href="/jobs">
          <div className="space-y-3">
            {latestJobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </Section>
      ) : null}

      {latestArticles.length > 0 ? (
        <Section title="동문 이야기" href="/content">
          <div className="space-y-3">
            {latestArticles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="추천 동문" href="/alumni" accent>
        {recommended.length === 0 ? (
          <EmptyState
            title="아직 추천할 동문이 없어요"
            description="프로필을 채우면 더 많은 동문이 모여요"
          />
        ) : (
          <div className="space-y-3">
            {recommended.map((p) => (
              <ProfileCard key={p.id} profile={p} />
            ))}
          </div>
        )}
      </Section>

      {recentAlbums.length > 0 ? (
        <Section title="행사 기록" href="/albums">
          <AlbumGrid albums={recentAlbums} />
        </Section>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function Section({
  title,
  href,
  accent = false,
  children,
}: {
  title: string;
  href: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
          {accent ? <Sparkles className="h-4 w-4 text-primary" /> : null}
          {title}
        </h2>
        <Link
          href={href}
          className="flex items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}
