// Add news at the top. Sidebar shows the 5 most recent.
// Each item: { date: "YYYY-MM-DD", text: "Short blurb", link?: "https://..." }
export interface NewsItem {
  date: string;
  text: string;
  link?: string;
}

export const news: NewsItem[] = [
  {
    date: "2026-07-02",
    text: "Heading to DEF CON 2026 Aerospace Village — Aug 6–9, Las Vegas Convention Center (West Hall). I helped build 4 hands-on satellite-hacking scenarios on OpenVSA (my open-source satellite ground station), and as its author I'll be there to help anyone who wants to try them.",
  },
  {
    date: "2026-04-22",
    text: "Presented at CISC-S'26 in Busan on May 8 — VSA (Virtual Satellite Antenna) and mrradio.kr.",
  },
];
