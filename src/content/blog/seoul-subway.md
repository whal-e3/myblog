---
title: "Seoul Subway in 3D"
description: "An interactive hobby map of Seoul's subway network with optional station-level train reports."
date: 2026-10-14
draft: false
tags:
  - hobby
  - visualization
comments: false
---

I've been building **Seoul Subsurface**, a small interactive map of the Seoul metropolitan subway. It opens above the full South Korea outline, then zooms toward Seoul and eases into a 3D view of 24 mapped lines and 659 stations. You can return to the country view, search for stations, rotate the map, and explore the network from different angles.

The live layer can show station-level train reports from Seoul's official `realtimePosition` API when the server has an approved key. All 19 connected routes returned full provider-reported snapshots in a local test, but only Line 2 is enabled by default under the standard daily request limit. Incheon Lines 1 and 2, Gimpo Goldline, Everline, and Uijeongbu remain map-only until a suitable live source is available. Each report names a station and a report time; it is **not GPS tracking or an arrival prediction**. Brief model movement between reports is a labeled visual estimate on unambiguous track, while the reported station remains visible. The map remains explorable when the feed is unavailable.

<a href="/miniprj/seoul-subway/" data-astro-reload>Open the subway map →</a>

The map geometry draws on [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), the [seoul-subway network compilation](https://github.com/wantaekchoi/seoul-subway), and [Natural Earth](https://www.naturalearthdata.com/) for the South Korea outline. Live reports are credited to the [Seoul Metropolitan Government / TOPIS](https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do). More source and license details are in the map's **Data & credits** panel.
