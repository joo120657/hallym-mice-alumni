import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 인앱 알림 생성 (§6.8) — 서버에서만 호출.
 * 표시 측(NotificationList)과 동일한 payload 계약 { title, message, link } 으로 통일한다.
 * 실패해도 본 작업(제안 발송·공고 승인 등)을 막지 않는다(best-effort 로깅).
 */
export async function createInAppNotification(input: {
  profileId: string;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    profile_id: input.profileId,
    type: input.type,
    channel: "in_app",
    payload: {
      title: input.title,
      message: input.message ?? null,
      link: input.link ?? null,
    },
  });
  if (error) {
    console.error("[notifications] in_app 생성 실패", error.message);
  }
}
