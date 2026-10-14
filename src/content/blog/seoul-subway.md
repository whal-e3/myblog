---
title: "Seoul Subway in 3D"
description: "An interactive 3D Seoul subway map with simulated trains, Korean rail context, and K-pop places."
date: 2026-10-14
draft: false
tags:
  - hobby
  - visualization
comments: false
---

I've been building **Seoul Subsurface**, a small interactive map of the Seoul metropolitan subway. It opens above South Korea, then zooms toward Seoul and eases into a 3D view of 24 mapped lines and 659 stations. You can return to the country view, search for stations, rotate the map, and explore the network from different angles.

The country view also shows mapped passenger-rail corridors, including regional metro and light rail beyond Seoul and intercity rail. These are static track alignments; overlapping KTX, SRT, ITX and conventional services are not drawn as separate copies of the same track. A separate Seoul K-pop layer lets you explore a curated set of places with original, schematic 3D models. The place cards link to official information and explain what can be viewed publicly. Use **Around Korea** in the map sidebar to focus on another city, browse routes, or jump to the K-pop places.

The moving 3D trains are **simulated, not live**. They travel along all 24 mapped Seoul-area routes, including five routes without a confirmed reusable position feed. Their identities, positions, counts, and timing are invented for the visualization; they are **not actual train locations or arrival predictions**. A single afternoon sample of station-level reports from Seoul's official `realtimePosition` API helps set broad route density, but it cannot describe a typical full day. Other hours and the five routes without a verified feed use illustrative assumptions. The animation runs without continuously calling the API.

<a href="/miniprj/seoul-subway/" data-astro-reload>Open the subway map →</a>

The map geometry draws on [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), the [seoul-subway network compilation](https://github.com/wantaekchoi/seoul-subway), and [Natural Earth](https://www.naturalearthdata.com/) for the South Korea outline. [Korail's route map](https://info.korail.com/info/contents.do?key=857) and [SRT's service list](https://etk.srail.kr/cms/archive.do?pageId=KR0405000000) helped check the national layer; their artwork was not copied. The aggregate sample is credited to the [Seoul Metropolitan Government / TOPIS](https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do). More source and license details are in the map's **Data & credits** panel.
