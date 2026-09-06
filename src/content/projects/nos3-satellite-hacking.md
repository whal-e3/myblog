---
title: NOS3 Satellite Hacking Scenario
tagline: Command-injection attack on a spacecraft's unencrypted CCSDS telecommand link, built and defended on NASA's NOS3 simulator
taglineKo: CCSDS telecommand link에 대한 command-injection 공격과 방어 — NASA의 NOS3 시뮬레이터에서 구현
bodyKo: |
  [NASA의 NOS3](https://github.com/nasa/nos3)(NASA Operational Simulator for Small Satellites)를 이용하여 command injection 공격과 방어 시나리오를 구현했습니다. NOS3는 NASA의 실제 cFS flight software를 구동하며, 위성 telecommand (CCSDS)가 암호화되지 않은 채 전송될 때 어떤 일이 벌어지는지 보여줍니다.

  위성 하드웨어 중 하나인 reaction wheel로 이어지는 명령 경로를 추적해 set-torque 명령을 Wireshark로 캡처하고(평문 CCSDS 133.0-B-1 헤더), Python 스크립트로 torque 값을 크게 높인 패킷을 송신하여 시뮬레이션 위성을 제어 불능 상태로 회전시켰습니다. 또한 이를 CCSDS SDLS (CryptoLib 라이브러리)를 활성화함으로써 공격이 차단되는 것까지 확인했습니다.

  정보보호학회지 게재 (2025년 4월, 1저자)
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

Published in **Review of KIISC** (정보보호학회지), Apr 2025 (first author).
