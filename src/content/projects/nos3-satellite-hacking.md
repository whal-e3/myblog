---
title: NOS3 Satellite Hacking Scenario
tagline: Command-injection attack on a spacecraft's unencrypted CCSDS telecommand link, built and defended on NASA's NOS3 simulator
period: "2025"
status: concluded
order: 5
cover: /assets/content/project/nos3-satellite-hacking/cover.png
links:
  - label: Demo video
    url: https://www.youtube.com/watch?v=ZL8HDdskmCw
posts: []
---

An attack-and-defense scenario on [**NASA's NOS3**](https://github.com/nasa/nos3) (NASA Operational Simulator for Small Satellites), which runs NASA's real **cFS** flight software — showing what happens when satellite telecommand (**CCSDS**) travels unencrypted.

I traced the command path to the virtual **reaction wheel**, captured the set-torque command in Wireshark (plaintext **CCSDS 133.0-B-1** header, no authentication), and — with a Python script — replayed a modified copy with the torque cranked far up, spinning the simulated satellite out of control. On the defense side, I demonstrated that enabling CCSDS **SDLS** (via the **CryptoLib** library) stops this — commands are encrypted and authenticated, so injected ones are rejected.

Published at **CISC 2025** (first author).
