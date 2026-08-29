// Add news at the top. Sidebar shows the 5 most recent.
// Each item: { date: "YYYY-MM-DD", text: "Short blurb", link?: "https://..." }
// `textKo` is optional — when present, the Korean view shows it; otherwise the
// English `text` is shown in both languages.
export interface NewsItem {
  date: string;
  text: string;
  textKo?: string;
  link?: string;
}

export const news: NewsItem[] = [
  {
    date: "2026-07-02",
    text: "Heading to DEF CON 2026 Aerospace Village — Aug 6–9, Las Vegas Convention Center (West Hall). I helped build 4 hands-on satellite-hacking scenarios on OpenVSA (my open-source satellite ground station), and as its author I'll be there to help anyone who wants to try them.",
    textKo: "DEF CON 2026 Aerospace Village에 참가합니다 — 8월 6–9일, Las Vegas Convention Center (West Hall). 제가 개발한 오픈소스 위성 지상국 OpenVSA를 사용한 실습형 위성 해킹 시나리오 4종의 제작에 참여했으며, 개발자로서 현장에서 관심 있는 분들의 실습을 직접 지원합니다.",
  },
  {
    date: "2026-04-22",
    text: "Presented at CISC-S'26 in Busan on May 8 — VSA (Virtual Satellite Antenna) and mrradio.kr.",
    textKo: "5월 8일 부산에서 열린 CISC-S'26에서 위성 보안 논문을 발표했습니다 — VSA(Virtual Satellite Antenna) & mrradio.kr.",
  },
];
