"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EMPTY } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { JOB_TYPE_LABEL, JOB_TYPE_OPTIONS } from "@/lib/labels";
import type { JobListItem, JobListResult } from "@/lib/jobs/types";
import type { TagRow } from "@/types/database";

import { JobCard } from "./JobCard";

/**
 * 구인구직 보드 (§6.4 / §11.3 패턴). 검색 + 유형/태그 필터 + 무한 스크롤.
 * DirectoryView 와 동일한 4상태(로딩/에러/빈3종/리스트) 구조.
 */
interface Filters {
  q: string;
  type: string;
  tag: string;
}
const EMPTY_FILTERS: Filters = { q: "", type: "", tag: "" };

export function JobsBoard({
  tags,
  initialData,
}: {
  tags: TagRow[];
  /** 서버에서 미리 조회한 첫 페이지(기본 필터 기준). 있으면 마운트 fetch 를 생략한다. */
  initialData?: JobListResult;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [items, setItems] = useState<JobListItem[]>(initialData?.items ?? []);
  const [cursor, setCursor] = useState<number | null>(
    initialData ? initialData.nextCursor : 0,
  );
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "loadingMore"
  >(initialData ? "ready" : "loading");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // initialData 는 기본 필터(EMPTY_FILTERS) 기준이므로 첫 마운트의 fetch 만 건너뛴다.
  const skipFirstFetch = useRef(false);

  const hasActiveFilters = applied.type !== "" || applied.tag !== "";
  const hasQuery = applied.q.trim() !== "";

  const buildUrl = useCallback(
    (cur: number) => {
      const sp = new URLSearchParams();
      if (applied.q.trim()) sp.set("q", applied.q.trim());
      if (applied.type) sp.set("type", applied.type);
      if (applied.tag) sp.set("tag", applied.tag);
      sp.set("cursor", String(cur));
      return `/api/jobs?${sp.toString()}`;
    },
    [applied],
  );

  // 타이핑 즉시 검색 — 입력 멈춤 300ms 후 자동 적용(제출 불필요). 같은 값이면 재조회 안 함.
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied((prev) =>
        prev.q === filters.q ? prev : { ...prev, q: filters.q },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // applied 변경 시 첫 페이지 로드 — 타이핑 중 깜빡임 방지를 위해 이전 결과를 유지한다.
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setCursor(0);
    (async () => {
      try {
        const res = await fetch(buildUrl(0));
        if (!res.ok) throw new Error(String(res.status));
        const data: JobListResult = await res.json();
        if (cancelled) return;
        setItems(data.items);
        setCursor(data.nextCursor);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (cursor === null || status !== "ready") return;
    setStatus("loadingMore");
    try {
      const res = await fetch(buildUrl(cursor));
      if (!res.ok) throw new Error(String(res.status));
      const data: JobListResult = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setStatus("ready");
    } catch {
      setStatus("ready");
    }
  }, [buildUrl, cursor, status]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [loadMore]);

  function apply() {
    setApplied(filters);
    setShowFilters(false);
  }
  function reset() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setShowFilters(false);
  }
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Enter = 즉시 적용(디바운스 대기 생략). 같은 값이면 재조회 안 함.
    setApplied((prev) =>
      prev.q === filters.q ? prev : { ...prev, q: filters.q },
    );
  }

  return (
    <div>
      <div className="sticky top-14 z-10 space-y-3 border-b bg-background px-5 py-3">
        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="공고·회사 검색"
              className="pl-9"
              aria-label="공고 검색"
            />
          </div>
          <Button
            type="button"
            variant={hasActiveFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters((s) => !s)}
            aria-label="필터"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </form>

        {(hasActiveFilters || hasQuery) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {hasQuery ? <Badge variant="secondary">{`"${applied.q}"`}</Badge> : null}
            {applied.type ? (
              <Badge variant="secondary">
                {JOB_TYPE_LABEL[applied.type as keyof typeof JOB_TYPE_LABEL]}
              </Badge>
            ) : null}
            {applied.tag ? (
              <Badge variant="secondary">
                {tags.find((t) => t.id === applied.tag)?.name ?? "태그"}
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
            >
              <X className="h-3 w-3" /> 초기화
            </button>
          </div>
        )}

        {showFilters && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">공고 유형</label>
              <Select
                value={filters.type || "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, type: v === "all" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {JOB_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">분야 태그</label>
              <Select
                value={filters.tag || "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, tag: v === "all" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={apply}>
                적용
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                초기화
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4">
        {status === "loading" && items.length === 0 ? (
          <LoadingSkeleton variant="list" count={5} />
        ) : status === "error" ? (
          <ErrorState
            description="목록을 불러오지 못했어요."
            onRetry={() => setApplied({ ...applied })}
          />
        ) : status !== "loading" && items.length === 0 ? (
          hasQuery ? (
            <EmptyState
              title={EMPTY.jobsSearchZero.title}
              description={EMPTY.jobsSearchZero.cta}
            />
          ) : hasActiveFilters ? (
            <EmptyState
              title={EMPTY.jobsFilterZero.title}
              description={EMPTY.jobsFilterZero.cta}
              action={{ label: "필터 초기화", onClick: reset }}
            />
          ) : (
            <EmptyState
              title={EMPTY.jobsNoData.title}
              description={EMPTY.jobsNoData.cta}
            />
          )
        ) : (
          <div
            className={cn(
              "space-y-3 transition-opacity",
              status === "loading" && "opacity-50",
            )}
          >
            {items.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
            <div ref={sentinelRef} aria-hidden className="h-px" />
            {status === "loadingMore" ? (
              <LoadingSkeleton variant="list" count={2} />
            ) : null}
            {cursor === null && status === "ready" && items.length > 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                모든 공고를 불러왔어요
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
