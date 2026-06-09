import Link from "next/link";

import { requireMemberPage } from "@/lib/guards/page";
import { getPublicAlbum } from "@/lib/albums/public";
import { AlbumViewer } from "@/components/albums/AlbumViewer";
import { AdminInlineBar } from "@/components/admin/AdminInlineBar";
import { AlbumPublishToggle } from "@/components/albums/AlbumPublishToggle";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { ERROR } from "@/lib/messages";

/**
 * 회원 갤러리 — 앨범 상세 (§6.5-5 / T-156).
 * 로그인 회원만 열람(서버 가드). 공개 앨범이 아니면 빈/없음 처리.
 */
export const dynamic = "force-dynamic";

export default async function MemberAlbumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const me = await requireMemberPage(`/albums/${id}`);

  const result = await getPublicAlbum(me, id);

  if (!result) {
    return (
      <section className="px-5 py-6">
        <Link
          href="/albums"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← 행사 기록
        </Link>
        <EmptyState
          title={ERROR.notFound.title}
          description="비공개이거나 삭제된 앨범이에요."
          action={{ label: ERROR.notFound.cta, href: "/albums" }}
          className="mt-6"
        />
      </section>
    );
  }

  return (
    <section className="px-5 py-6">
      <Link
        href="/albums"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← 행사 기록
      </Link>
      {me.isAdmin ? (
        <AdminInlineBar
          editHref={`/admin/albums/${id}`}
          statusBadge={
            !result.album.is_public ? (
              <Badge variant="secondary">비공개 (관리자만 열람 중)</Badge>
            ) : null
          }
          primaryActions={<AlbumPublishToggle album={result.album} />}
          deleteUrl={`/api/admin/albums/${id}`}
          deleteConfirmText="정말 삭제할까요? (이미지도 함께 삭제)"
          deleteRedirect="/albums"
          deleteLabel="앨범 삭제"
        />
      ) : null}
      <AlbumViewer album={result.album} images={result.images} />
    </section>
  );
}
