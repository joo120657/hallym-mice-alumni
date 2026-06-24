"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { JOB_TYPE_OPTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { JobType, TagRow } from "@/types/database";

export interface JobEditorInitial {
  id: string;
  title: string;
  organization: string;
  job_type: JobType;
  location: string;
  deadline: string;
  compensation: string;
  description: string;
  requirements: string;
  apply_url: string;
  contact: string;
  tag_ids: string[];
}

/**
 * 공고 작성/수정 폼 (§6.4). 생성=POST /api/jobs(→published), 수정=PATCH /api/jobs/:id.
 * 제출 후 상세로 이동. status/author_id 는 서버가 관리하므로 폼에 없다.
 */
export function JobEditor({
  tags,
  initial,
}: {
  tags: TagRow[];
  initial?: JobEditorInitial;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    organization: initial?.organization ?? "",
    job_type: (initial?.job_type ?? "fulltime") as JobType,
    location: initial?.location ?? "",
    deadline: initial?.deadline ?? "",
    compensation: initial?.compensation ?? "",
    description: initial?.description ?? "",
    requirements: initial?.requirements ?? "",
    apply_url: initial?.apply_url ?? "",
    contact: initial?.contact ?? "",
  });
  const [tagIds, setTagIds] = useState<string[]>(initial?.tag_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleTag(id: string) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id].slice(0, 10),
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      organization: form.organization.trim(),
      job_type: form.job_type,
      location: form.location.trim() || null,
      deadline: form.deadline || null,
      compensation: form.compensation.trim() || null,
      description: form.description.trim(),
      requirements: form.requirements.trim() || null,
      apply_url: form.apply_url.trim() || null,
      contact: form.contact.trim() || null,
      tag_ids: tagIds,
    };
    try {
      const res = await fetch(initial ? `/api/jobs/${initial.id}` : "/api/jobs", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했어요.");
        setBusy(false);
        return;
      }
      const id = initial?.id ?? data.id;
      router.push(`/jobs/${id}`);
      router.refresh();
    } catch {
      setError("저장에 실패했어요.");
      setBusy(false);
    }
  }

  const canSubmit =
    form.title.trim() && form.organization.trim() && form.description.trim();

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field label="제목" required>
        <Input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="예: 2026 신입 PD 채용"
          maxLength={200}
        />
      </Field>

      <Field label="회사/기관명" required>
        <Input
          value={form.organization}
          onChange={(e) => set("organization", e.target.value)}
          maxLength={200}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="유형" required>
          <Select
            value={form.job_type}
            onValueChange={(v) => set("job_type", v as JobType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="마감일">
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => set("deadline", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="근무지">
          <Input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="예: 서울 / 원격"
          />
        </Field>
        <Field label="보상/급여">
          <Input
            value={form.compensation}
            onChange={(e) => set("compensation", e.target.value)}
            placeholder="예: 협의 / 월 250"
          />
        </Field>
      </div>

      <Field label="상세 내용" required>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="직무 소개·주요 업무 등"
        />
      </Field>

      <Field label="자격 요건">
        <Textarea
          value={form.requirements}
          onChange={(e) => set("requirements", e.target.value)}
          rows={3}
          maxLength={3000}
        />
      </Field>

      <Field label="지원 링크 (https)">
        <Input
          value={form.apply_url}
          onChange={(e) => set("apply_url", e.target.value)}
          placeholder="https://..."
          inputMode="url"
        />
      </Field>

      <Field label="담당자 연락처">
        <Input
          value={form.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="예: 채용 담당 이메일/전화"
        />
      </Field>

      {tags.length > 0 ? (
        <Field label="분야 태그 (최대 10개)">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  aria-pressed={on}
                >
                  <Badge
                    variant={on ? "default" : "outline"}
                    className={cn("cursor-pointer", on && "ring-1 ring-ring")}
                  >
                    {t.name}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Field>
      ) : null}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => router.back()}>
          취소
        </Button>
        <Button className="flex-1" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? "저장 중..." : initial ? "수정 저장" : "공고 등록"}
        </Button>
      </div>
      {!initial ? (
        <p className="text-center text-xs text-muted-foreground">
          등록하면 바로 기회 페이지에 게시돼요.
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
