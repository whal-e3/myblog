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
    text: "Heading to DEF CON 2026 Aerospace Village — Aug 6–9, Las Vegas Convention Center (West Hall) — running a booth with 4 hands-on satellite-hacking scenarios/challenges I built on VSA.",
  },
  {
    date: "2026-04-22",
    text: "Presented at CISC-S'26 in Busan on May 8 — VSA (Virtual Satellite Antenna) and mrradio.kr.",
  },
];
