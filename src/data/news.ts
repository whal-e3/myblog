// Add news at the top. Sidebar shows the 5 most recent.
// Each item: { date: "YYYY-MM-DD", text: "Short blurb", link?: "https://..." }
export interface NewsItem {
  date: string;
  text: string;
  link?: string;
}

export const news: NewsItem[] = [
  {
    date: "2026-04-22",
    text: "Presenting at CISC-S'26 in Busan on May 7 — VSA (Virtual Satellite Antenna) and mrradio.kr.",
  },
];
