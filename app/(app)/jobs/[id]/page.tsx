import Link from "next/link";

import { ArrowLeft, Building2, CalendarClock, MapPin } from "lucide-react";

import { JobActions } from "@/components/jobs/JobActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { requireMemberPage } from "@/lib/guards/page";
import { getPublishedJob } from "@/lib/jobs/queries";
import { makeCohortHash, recordEvent } from "@/lib/analytics/events";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, formatDate } from "@/lib/labels";
import { ERROR } from "@/lib/messages";

/**
 * 공고 상세 (§6.4). 타인=published/closed 만, 작성자/관리자=모든 상태.
 * 지원 링크는 외부(https), 클릭 시 job_apply_click 기록(JobActions).
 */
export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireMemberPage(`/jobs/${id}`);

  const result = await getPublishedJob(me, id);
  if (result.kind === "not_found") {
    return (
      <DetailShell>
        <EmptyState
          title={ERROR.notFound.title}
          description="없거나 비공개된 공고예요."
          action={{ label: "공고 목록", href: "/jobs" }}
        />
      </DetailShell>
    );
  }

  const j = result.job;
  const today = new Date().toISOString().slice(0, 10);
  const closed = j.status === "closed" || (!!j.deadline && j.deadline < today);

  if (!j.is_author) {
    try {
      await recordEvent({
        eventType: "job_view",
        cohortHash: makeCohortHash(me.userId),
        profileId: me.profile.id,
        targetId: j.id,
      });
    } catch {
      // 무시.
    }
  }

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="뒤로">
            <Link href="/jobs">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">공고</span>
        </div>
        {j.is_author ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/jobs/${j.id}/edit`}>수정</Link>
          </Button>
        ) : null}
      </header>

      <section className="px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{JOB_TYPE_LABEL[j.job_type]}</Badge>
          {closed ? <Badge variant="outline">마감</Badge> : null}
          {j.is_author && j.status !== "published" && j.status !== "closed" ? (
            <Badge variant="outline">{JOB_STATUS_LABEL[j.status]}</Badge>
          ) : null}
        </div>
        <h1 className="mt-3 text-headline font-bold">{j.title}</h1>
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            {j.organization}
            {j.author ? ` · ${j.author.name}` : ""}
          </p>
          {j.location ? (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {j.location}
            </p>
          ) : null}
          {j.deadline ? (
            <p className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />~{formatDate(j.deadline)} 마감
            </p>
          ) : null}
          {j.compensation ? <p>보상: {j.compensation}</p> : null}
        </div>
      </section>

      <section className="mt-6 space-y-5 px-5">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">상세</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{j.description}</p>
        </div>
        {j.requirements ? (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">자격 요건</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{j.requirements}</p>
          </div>
        ) : null}
        {j.tags.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">분야</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {j.tags.map((t) => (
                <Badge key={t.id} variant="secondary">
                  {t.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8 px-5">
        <JobActions
          jobId={j.id}
          applyUrl={j.apply_url}
          contact={j.contact}
          isBookmarked={j.is_bookmarked}
          isClosed={closed}
        />
      </section>
    </div>
  );
}

function DetailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-8">
      <header className="flex items-center gap-2 px-5 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="뒤로">
          <Link href="/jobs">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">공고</span>
      </header>
      {children}
    </div>
  );
}
