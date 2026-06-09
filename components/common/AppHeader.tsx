"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Bell, ExternalLink, FileText, Images, Shield, User } from "lucide-react";

import { LogoutButton } from "@/components/profile/LogoutButton";
import { Avatar } from "@/components/profile/Avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * 앱 상단 헤더 (§5.1 보강).
 * 좌측 브랜드(→홈), 우측 계정 메뉴(아바타 탭 → 시트).
 * 계정 메뉴로 로그아웃·내 정보·공개 프로필·(관리자) 진입을 한 곳에서 노출해
 * "로그아웃을 못 찾는" 발견성 문제를 해결한다.
 *
 * 새 의존성 없이 기존 Dialog 를 메뉴 시트로 재사용한다(인수인계 단순성).
 * 데이터(이름/사진/관리자여부)는 (app)/layout 이 서버에서 주입한다.
 */
const HIDDEN_PREFIXES = ["/onboarding"];

export function AppHeader({
  name,
  photoSrc,
  profileId,
  isAdmin,
  unread = 0,
}: {
  name: string;
  photoSrc: string | null;
  profileId: string;
  isAdmin: boolean;
  unread?: number;
}) {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-5">
        <Link
          href="/home"
          className="text-base font-semibold tracking-tight"
          aria-label="홈으로"
        >
          한림 MICE
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label={unread > 0 ? `알림 ${unread}개` : "알림"}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            ) : null}
          </Link>

          <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="내 계정 메뉴 열기"
              className="rounded-full ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Avatar src={photoSrc} name={name} size={32} />
            </button>
          </DialogTrigger>
          <DialogContent className="gap-2 p-4">
            <DialogTitle className="px-1 pb-1 text-sm text-muted-foreground">
              {name}
            </DialogTitle>
            <nav className="flex flex-col">
              <MenuLink href="/me" icon={User}>
                내 정보
              </MenuLink>
              <MenuLink href={`/alumni/${profileId}`} icon={ExternalLink}>
                공개 프로필 보기
              </MenuLink>
              <MenuLink href="/content" icon={FileText}>
                콘텐츠
              </MenuLink>
              <MenuLink href="/albums" icon={Images}>
                행사 기록
              </MenuLink>
              {isAdmin ? (
                <MenuLink href="/admin" icon={Shield}>
                  관리자
                </MenuLink>
              ) : null}
            </nav>
            <LogoutButton variant="outline" className="mt-2 w-full" />
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <DialogClose asChild>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors hover:bg-accent"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        {children}
      </Link>
    </DialogClose>
  );
}
