"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

/**
 * 회원-대면 상세(콘텐츠/앨범)에 얹는 관리자 전용 인라인 관리바 셸.
 *
 * 표시 여부는 호출부에서 me.isAdmin 으로 결정한다(이 컴포넌트는 권한을 재판정하지 않는다).
 * '수정'은 기존 운영자 편집 화면으로 보내고, 게시/공개 토글은 도메인별 primaryActions 로 주입,
 * 삭제는 공용 ConfirmDeleteButton 을 쓴다. 실제 권한은 각 API(withAuth role=admin)가 강제한다.
 */
export function AdminInlineBar({
  editHref,
  statusBadge,
  primaryActions,
  deleteUrl,
  deleteConfirmText,
  deleteRedirect,
  deleteLabel,
}: {
  editHref: string;
  statusBadge?: ReactNode;
  primaryActions?: ReactNode;
  deleteUrl?: string;
  deleteConfirmText?: string;
  deleteRedirect?: string;
  deleteLabel?: string;
}) {
  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          관리자
        </span>
        {statusBadge}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={editHref}>수정</Link>
          </Button>
          {primaryActions}
          {deleteUrl ? (
            <ConfirmDeleteButton
              url={deleteUrl}
              confirmText={deleteConfirmText}
              redirectTo={deleteRedirect}
              label={deleteLabel}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
