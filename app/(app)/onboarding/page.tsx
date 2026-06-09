import { OnboardingForm } from "./onboarding-form";

/**
 * 가입 정보 입력 + 동의 (§6.1c / §11.2 / T-101).
 * 최소 필드 + 동의 3체크 → 제출 즉시 회원(status='active'). 검증 게이트 없음.
 * 풀스크린 폼이라 하단 탭을 숨긴다(BottomNav.HIDDEN_PREFIXES).
 */
export default function OnboardingPage() {
  return (
    <section className="px-5 py-8">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">
        가입
      </p>
      <h1 className="mt-1 text-xl font-bold">가입 정보 입력</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        이름·역할·학과와 졸업연도(또는 학번), 필수 동의 3가지를 입력하면 바로
        회원이 됩니다. 회사·사진·소개는 가입 후 내 정보에서 채울 수 있어요.
      </p>
      <OnboardingForm />
    </section>
  );
}
