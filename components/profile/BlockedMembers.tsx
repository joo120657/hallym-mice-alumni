"use client";

import { useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/button";

/**
 * 차단한 회원 목록 + 해제 (§6.3-4). /api/blocks GET/DELETE 사용.
 * 차단이 없으면 섹션 자체를 숨긴다(대부분 사용자에게 불필요).
 */
export function BlockedMembers() {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/blocks", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setList(json.blocked ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/blocks", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_profile_id: id }),
      });
      if (res.ok) setList((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (loading || list.length === 0) return null;

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-semibold">차단한 회원</p>
      <p className="mt-1 text-xs text-muted-foreground">
        해제하면 서로의 프로필이 다시 보이고 제안을 주고받을 수 있어요.
      </p>
      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar src={null} name={p.name} size={32} />
              <span className="truncate text-sm">{p.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === p.id}
              onClick={() => void unblock(p.id)}
            >
              {busyId === p.id ? "해제 중…" : "차단 해제"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
