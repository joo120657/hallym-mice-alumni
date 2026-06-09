/**
 * 검색어 정제 — PostgREST `.or()` 필터 DSL 에 보간되기 전 메타문자를 제거한다.
 *
 * `.or("name.ilike.%term%,...")` 의 인자는 파라미터화된 값이 아니라 필터 표현식이라,
 * term 에 콤마/점/괄호/별표 등이 들어가면 OR 그룹 안에 임의 필터를 주입할 수 있다.
 * 한글·영숫자·공백·_- 만 통과시켜 필터 인젝션을 차단한다(검색 품질 영향 미미).
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
