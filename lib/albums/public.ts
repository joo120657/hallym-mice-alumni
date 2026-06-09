import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AlbumImageRow, AlbumRow } from "@/types/database";

/**
 * 회원 갤러리 열람용 서버 조회 (§6.5-5 / T-156).
 *
 * 열람은 로그인 회원으로 제한된다(호출부에서 requireMember 가드 필수).
 * 공개(is_public=true) 앨범만 노출한다. service_role(admin)로 서버에서만 호출.
 */

/** 공개 앨범 목록(최신 행사일 순). limit 으로 미리보기용 소량 조회 가능. */
export async function listPublicAlbums(limit = 200): Promise<AlbumRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("albums")
    .select("*")
    .eq("is_public", true)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[albums] 목록 조회 실패: ${error.message}`);
  return (data ?? []) as AlbumRow[];
}

/** 공개 앨범 단건 + 이미지. 비공개/없음 → null. */
export async function getPublicAlbum(
  id: string,
): Promise<{ album: AlbumRow; images: AlbumImageRow[] } | null> {
  const admin = createAdminClient();
  const { data: album } = await admin
    .from("albums")
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle<AlbumRow>();

  if (!album) return null;

  const { data: images } = await admin
    .from("album_images")
    .select("*")
    .eq("album_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return { album, images: (images ?? []) as AlbumImageRow[] };
}
