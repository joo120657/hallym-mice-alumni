import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { JOB_TYPE_LABEL, formatDate } from "@/lib/labels";
import type { JobListItem } from "@/lib/jobs/types";

import { BookmarkButton } from "./BookmarkButton";

/**
 * 공고 카드 (§11 / §6.4). 유형 배지·마감일·회사·태그 + 북마크 토글.
 * 카드 전체가 상세로의 링크이고, 북마크 버튼만 별도 클릭 영역.
 */
export function JobCard({ job }: { job: JobListItem }) {
  const today = new Date().toISOString().slice(0, 10);
  const closed =
    job.status === "closed" || (!!job.deadline && job.deadline < today);
  return (
    <Card className="relative p-4 transition-colors hover:bg-accent/40">
      <div className="absolute right-2 top-2">
        <BookmarkButton jobId={job.id} initial={job.is_bookmarked} />
      </div>
      <Link href={`/jobs/${job.id}`} className="block pr-9">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">{JOB_TYPE_LABEL[job.job_type]}</Badge>
          {closed ? (
            <Badge variant="outline">마감</Badge>
          ) : job.deadline ? (
            <span className="text-xs text-muted-foreground">
              ~{formatDate(job.deadline)}
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 font-semibold leading-snug">{job.title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {job.organization}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        {job.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.tags.slice(0, 3).map((t) => (
              <Badge key={t.id} variant="outline">
                {t.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </Link>
    </Card>
  );
}
