---
title: World's first virtual RF hacking wargame 'mrradio.kr'
description: About making mrradio.kr. The RF wargame website.
date: 2026-03-13
lastmod: 2026-03-16
draft: false
tags:
authors:
  - sunhyuk
categories:
  - project
cover:
publish: true
comments: false
difficulty:
series:
---
# Mr.Radio — An RF Hacking Wargame Platform

## What Is Mr.Radio

[Mr.Radio](https://mrradio.kr) is a wargame platform built to remove that barrier. It provides a set of RF security challenges that cover from identifying modulation schemes to eavesdropping on satellite communications — all without owning a single piece of RF hardware.

![[mrradio_homepage.mp4]]

## Why I Built This

RF security is an underserved area in cybersecurity. Unlike web or system hacking where you just need a browser or a terminal, RF hacking requires physical hardware — an SDR receiver, antennas, cables, and an actual signal to intercept. That barrier keeps most people out, which means fewer people can identify and fix RF vulnerabilities in real-world systems. Satellite communications, IoT devices, broadcast systems — they all rely on RF, and they all have attack surfaces that most security professionals never learn to test.

There's no "hack the box" equivalent for RF. You can't just spin up a VM and start learning. Mr.Radio is my attempt to change that — no hardware required, just a Linux machine and some curiosity.

## How It Works

The platform consists of two parts: the **wargame website** and the **Virtual Satellite Antenna** app.

### The Website

[mrradio.kr](https://mrradio.kr) hosts the RF hacking challenges. Sign up, pick a challenge, download the signal file, and extract the hidden flag. Submit it to earn points and climb the leaderboard.

![[mrradio_wargames.png]]

### Virtual Satellite Antenna (VSA)

For satellite challenges, you use the **Virtual Satellite Antenna (VSA)** app — a desktop application that virtualizes the entire satellite ground station, from the antenna rotator to the SDR receiver. It works with [GPredict](http://gpredict.oz9aec.net/) for real-time satellite tracking and Doppler correction.
The app simulates a real satellite signal receiving environment — if you misconfigure your setup, you get noise instead of signal, just like the real thing.

![[vsa.mp4]]
## Current Challenges

There are currently 7 challenges on the website. More challenges and an updated VSA will be added over time.

- FM Radio
- Guess the mod! no.1
- Guess the mod! no.2
- Enemy at the Morse
- DOLPHIN-1
- HUMPBACK-1
- BELUGA-1


If you've ever been curious about RF security but didn't know where to start, give it a shot at [mrradio.kr](https://mrradio.kr).

---