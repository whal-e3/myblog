---
title: Ground Station Spoofing via LoRa/TinyGS
tagline: A study of whether the open-source TinyGS ground-station network accepts a forged LoRa beacon
taglineKo: 오픈소스 TinyGS 지상국 네트워크가 위조된 LoRa beacon을 받아들이는지에 대한 연구
bodyKo: |
  TinyGS (LoRa 기반의 글로벌 네트워크 오픈소스 지상국)를 대상으로 위성 downlink와 관련된 보안 연구를 진행했습니다. 실제 LEO CubeSat의 LoRa beacon을 기준 신호로 삼아, 지상국이 위조된 beacon을 여과 없이 받아들이는지 실험했습니다.

  먼저 CubeSat의 beacon 바이너리를 파싱하는 Python decoder를 작성하고, ESP32 LoRa 보드(LILYGO LoRa32 / T-Beam)를 가짜 데이터(0xdeadbeef)가 주입된 위조 beacon을 송신하는 transmitter로 개발했습니다. TinyGS 펌웨어를 가짜 로컬 MQTT broker에 연결해 위조 패킷을 가로챔으로써 실제 공개 TinyGS 서버 (app.tinygs.com)로는 어떤 것도 전달되지 않도록 했습니다. Gqrx로 가짜 위성 신호가 송신됨을 확인하고, 지상국이 이 위조 패킷을 실제 위성에서 온 것처럼 수신하는 것을 확인할 수 있었습니다.

  KCC 2024 게재 (1저자)
period: "2024-06"
status: concluded
order: 8
cover: /assets/content/project/ground-station-spoofing/combined.png
links: []
posts: []
---

A study of the receive side of a satellite downlink on **TinyGS**, an open-source global network of LoRa ground stations. Using a real LEO CubeSat's LoRa beacon as a reference signal, I looked at whether such a ground station would accept a forged beacon.

I wrote a Python decoder to parse the CubeSat's beacon binary, then built an **ESP32 LoRa board** (LILYGO LoRa32 / T-Beam) into a transmitter that emits a spoofed beacon with injected data (`0xdeadbeef`). To keep the whole thing self-contained, I pointed the TinyGS firmware at a **fake local MQTT broker** that intercepted the forged packet — so nothing was ever forwarded to the public TinyGS backend (app.tinygs.com). I verified the emission in Gqrx and confirmed the ground station received the forged packet as if it came from the real satellite.

Published at **KCC 2024** (first author).
