import Link from "next/link";

import { ArticleReader } from "@/components/content/ArticleReader";
import { AdminInlineBar } from "@/components/admin/AdminInlineBar";
import { ContentStatusActions } from "@/components/content/ContentStatusActions";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { requireMemberPage } from "@/lib/guards/page";
import { getPublishedArticle } from "@/lib/content/public";
import { makeCohortHash, recordEvent } from "@/lib/analytics/events";
import { ARTICLE_STATUS_LABEL, ARTICLE_STATUS_TONE } from "@/lib/labels";
import { ERROR } from "@/lib/messages";

/**
 * 회원 콘텐츠 상세 (§6.6). 게시(published)만 열람, 조회 시 article_view 기록.
 */
export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireMemberPage(`/content/${id}`);

  const result = await getPublishedArticle(me, id);
  if (result.kind === "not_found") {
    return (
      <section className="px-5 py-6">
        <Link
          href="/content"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← 콘텐츠
        </Link>
        <EmptyState
          title={ERROR.notFound.title}
          description="비공개이거나 삭제된 콘텐츠예요."
          action={{ label: ERROR.notFound.cta, href: "/content" }}
          className="mt-6"
        />
      </section>
    );
  }

  // 일반 회원의 게시글 열람만 집계한다(관리자 검수 열람·draft/hidden 은 조회수 오염 방지).
  if (result.article.status === "published" && !me.isAdmin) {
    try {
      await recordEvent({
        eventType: "article_view",
        cohortHash: makeCohortHash(me.userId),
        profileId: me.profile.id,
        targetId: id,
      });
    } catch {
      // 무시.
    }
  }

  return (
    <section className="px-5 py-6">
      <Link
        href="/content"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← 콘텐츠
      </Link>
      {me.isAdmin ? (
        <AdminInlineBar
          editHref={`/admin/content/${id}`}
          statusBadge={
            result.article.status !== "published" ? (
              <Badge variant={ARTICLE_STATUS_TONE[result.article.status]}>
                {ARTICLE_STATUS_LABEL[result.article.status]}
              </Badge>
            ) : null
          }
          primaryActions={
            <ContentStatusActions
              articleId={result.article.id}
              status={result.article.status}
            />
          }
          deleteUrl={`/api/admin/content/${id}`}
          deleteConfirmText="정말 삭제할까요?"
          deleteRedirect="/content"
          deleteLabel="콘텐츠 삭제"
        />
      ) : null}
      <ArticleReader article={result.article} />
    </section>
  );
}
