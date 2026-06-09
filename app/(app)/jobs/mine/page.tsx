import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { requireMemberPage } from "@/lib/guards/page";
import { listMyJobs } from "@/lib/jobs/queries";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  JOB_TYPE_LABEL,
  formatDate,
} from "@/lib/labels";

/**
 * 내 공고 (§6.4). 내가 올린 모든 상태(대기/게시/마감/숨김)를 상태 배지와 함께.
 * 승인 대기 공고를 다시 찾아 수정·마감하러 들어갈 수 있게 한다.
 */
export default async function MyJobsPage() {
  const me = await requireMemberPage("/jobs/mine");
  const jobs = await listMyJobs(me);

  return (
    <div className="pb-8">
      <header className="flex items-center gap-2 px-5 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="뒤로">
          <Link href="/jobs">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">내 공고</h1>
      </header>

      <div className="px-5">
        {jobs.length === 0 ? (
          <EmptyState
            title="올린 공고가 없어요"
            description="기회 탭에서 공고를 올려보세요"
            action={{ label: "공고 올리기", href: "/jobs/new" }}
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`}>
                  <Card className="p-4 transition-colors hover:bg-accent/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {JOB_TYPE_LABEL[j.job_type]}
                      </Badge>
                      <Badge variant={JOB_STATUS_TONE[j.status]}>
                        {JOB_STATUS_LABEL[j.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 font-semibold leading-snug">{j.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {j.organization}
                      {j.deadline ? ` · ~${formatDate(j.deadline)}` : ""}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
