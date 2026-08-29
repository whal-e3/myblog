---
title: Ground Station Spoofing via LoRa/TinyGS
tagline: A study of whether the open-source TinyGS ground-station network accepts a forged LoRa beacon
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
