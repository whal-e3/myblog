---
title: "OrbitScope: Plug In and Receive Satellite Signals"
description: "Plug in a receiver, choose a satellite pass, and see what OrbitScope can capture."
date: 2026-10-16
draft: false
tags:
  - project
  - rf
  - satellite
cover: /assets/content/blog/orbitscope/hardware-phone-rtl-sdr-nooelec.jpg
logo: /assets/content/blog/orbitscope/orbitscope-logo.svg
logoAlt: "OrbitScope logo"
comments: false
---

I built an Android app called **OrbitScope**. It's a plug and play satellite reception tool for total beginners. Connect an antenna and an SDR to your phone, choose a satellite, and tap Receive. OrbitScope handles frequency tuning and other settings, and also decodes supported signals. I used AI to help build it.

## How to use

### 1. Set up the antenna

Use an antenna suited to your target and place it where it has a clear view of the sky. I used this outdoor V-dipole for the METEOR satellite pass below.

<figure>
  <img src="/assets/content/blog/orbitscope/recent-v-dipole.jpg" alt="Outdoor V-dipole antenna with coax cable" loading="lazy" />
  <figcaption>V-dipole antenna (120°) with coax cable.</figcaption>
</figure>

### 2. Plug the receiver into your phone

Connect an antenna to a compatible software-defined radio (SDR), then plug the SDR into your Android phone through a USB adapter or hub. The photo shows one way to arrange the hardware, using an RTL-SDR Blog V3 and a Nooelec amplifier. You can also use HackRF One but other SDRs are not tested.

<figure>
  <img src="/assets/content/blog/orbitscope/hardware-phone-rtl-sdr-nooelec.jpg" alt="Phone running OrbitScope, USB adapter, RTL-SDR Blog V3, and Nooelec amplifier" loading="lazy" />
  <figcaption>Example RF setup: phone, USB adapter, RTL-SDR Blog V3, and Nooelec LNA</figcaption>
</figure>

### 3. Choose a pass/satellite

Let OrbitScope use your location, or enter it manually. Browse predicted passes and choose a supported satellite signal. OrbitScope shows when the satellite is expected to be visible, its direction and elevation, and the listed receive frequency.

OrbitScope currently supports these receive formats:

| Format | What OrbitScope produces |
| --- | --- |
| Narrowband FM voice | Live audio and a saved WAV; no speech transcription |
| 1200-baud AFSK / AX.25 | CRC-verified packets, including compatible APRS beacons |
| 9600-baud G3RUH / AX.25 | CRC-verified packets — **experimental**, not yet verified on-air |
| Meteor M2-x 72k LRPT | Checked frames and, when enough data decodes, a partial grayscale weather image — RTL-SDR only |
| PD120 SSTV | An image-decoding attempt from recorded FM audio |
| Martin M1 SSTV | An image-decoding attempt from recorded FM audio — newly implemented, not yet verified on-air |
| CW / Morse | Post-pass text *candidates* from saved I/Q — experimental, RTL-SDR only; not a verified beacon decode |

### 4. Start receiving

Shortly before a predicted pass, tap **Start receiving** and allow USB access if prompted. Follow reception in **Listen**, then stop the receiver when the pass ends. For supported image signals, OrbitScope automatically attempts to decode and save an image when enough usable data arrives.

## Outcome examples

During a **METEOR M2-4** pass on October 13, 2026, I received a signal at **137.900 MHz**. OrbitScope decoded these partial weather images for me.

<figure>
  <img src="/assets/content/blog/orbitscope/meteor-2026-10-13-false-color.png" alt="Partial weather image with clouds and blue horizontal gaps" loading="lazy" />
  <figcaption>METEOR M2-4 image #1</figcaption>
</figure>

<figure>
  <img src="/assets/content/blog/orbitscope/meteor-2026-10-13-msa-coastline.png" alt="Partial satellite image of East Asia with yellow coastlines and black gaps" loading="lazy" />
  <figcaption>Decoded METEOR M2-4 image #2</figcaption>
</figure>
