---
title: "Night Owl"
description: "CTF challenge writeup of \"Night Owl\" from DEFCON CTF Qual."
date: 2026-06-19
draft: false
tags:
  - reversing
  - rf
  - signal
  - crypto
comments: true
---

<figure style="text-align: center;">
  <img src="/assets/content/writeup/ctf/defcon2026_qual/challenge-page.png"
       alt="challenge page"
       style="max-width: 480px; width: 100%;" />
</figure>

---

## 0. What is a clicker?
<figure style="text-align: center;">
  <img src="/assets/content/writeup/ctf/defcon2026_qual/iclicker.png"
       alt="An iClicker 2 handheld student remote"
       style="max-width: 240px; width: 100%;" />
</figure>

A **clicker** is a handheld remote with answer buttons **A–E**. In a lecture, students press an answer and each press transmits a short radio packet to a receiver, which tallies responses and logs attendance. 

## 1. The challenge

> Professor Falcon teaches CPSC401 (Wireless Security) at Benevolent Bureau of Birds
> University and uses clicker devices for attendance. Students transmit answers wirelessly
> at **917 MHz** using **frequency hopping spread spectrum (FHSS)**.
>
> This semester the professor discovered two kinds of cheaters:
> - **Speed Clickers** — click instantly (**< 2 s**) without reading the question; they just
>   mash random buttons for attendance credit.
> - **Night Owls** — pre‑record their clicker signals at home, then **replay them late** in
>   class using a different device.
> - **Legitimate students** respond in **2–15 s** (normal human reading/thinking time) and
>   have **hidden a message in their responses**.
>
> During yesterday's lecture (2026‑03‑29, 2:30 PM) the base station captured 20 s of RF
> traffic. *Your mission: separate cheaters from legitimate students.* The recovered message
> is the flag body, wrapped as `bbb{recovered_message}`.

We are given a single file, **`lecture_capture.iq`**.

---

## 2. Parsing the capture

### lecture_capture.iq
- `80,004,096` bytes = **4096‑byte `ICLKR` header** + **80,000,000** bytes of IQ
- payload = 10,000,000 `complex64` samples @ 500 kHz = **20 s** of RF at 917 MHz

### Header 

The header is a small custom struct beginning with the magic `ICLKR`. **There is no spec** — every
label below was deduced. The last column records *how confident* each one is and how it was
established:

| offset | field | value | how I knew |
|-------:|-------|-------|------------|
| 0x00 | magic | `ICLKR` | ✅ **obvious** |
| 0x08 | version (u32) | `2` | ❓ |
| 0x0C | sample_rate (u32) | `500000` (500 kHz) | 🔎 **checked** — `500000` is read straight from here; it's the only rate that makes the file's size and 20 s length add up, and the data turns into clean tones when you use it (a wrong rate would just give noise) |
| 0x10 | center_freq (u32) | `917000000` (917 MHz) | ✅ **obvious** |
| 0x14 | u32 | `38000` | ⬜ **unknown** — never resolved; doesn't matter for the solve |
| 0x18 | u32 | `0x00555555` (the classic `0x55…` preamble) | ❓ |
| 0x1C | u32 | `0x003b8016` (sync word) | ❓ |
| 0x20 | u32 | `3500` (channel spacing / "baud") | 🔎 **checked** — guessed "baud", then **confirmed** when the FHSS channels landed on exact multiples of **3500 Hz** (§3) |
| 0x24 | f32 | `1.25` (mod index) | ❓ |
| 0x28 | f32 | `20.0` (duration, s) | ✅ **obvious** |
| 0x2C | string | `"2026-03-29 14:30"` | ✅ **obvious** |

---

## 3. Finding the bursts

Loaded into a waterfall/spectrogram viewer like **Inspectrum**, the structure is obvious by eye:
discrete **bursts** scattered across the 20 s, each parked on a clean **center tone** (its channel).
They stand out clearly — no denoising needed. `solve.py`'s **detect** stage just automates extracting
their exact start/end times: **82 bursts**, most ~30–37 ms (the real clicks) plus a few shorter ~8–19 ms.

![Step 3 — all 82 detected bursts across the 20 s capture](/assets/content/writeup/ctf/defcon2026_qual/step3_detect.png)
*The 82 bursts (green = every detection is a candidate) on the full waterfall — found, but not yet classified.*

### Per‑burst structure

For each burst I followed how its frequency changed over time (and double-checked with a
spectrogram). Every full click has the **same two‑tone shape**:

![One click in Inspectrum — short preamble tone + longer data tone](/assets/content/writeup/ctf/defcon2026_qual/click_two_tone.png)
*One click in Inspectrum (time →, frequency ↕)

* A short **preamble** burst during the amplitude ramp‑up.
* A longer **data** burst for the rest of the burst.
* **No** hidden modulation inside. Just a burst.

### Guesses

Measuring each tone's frequency precisely (to within a few Hz), two tidy patterns fall out:

- Each student sits on a **channel** — a frequency that's an exact multiple of 3500 Hz (`n·3500`).
  That channel number `n` is effectively the student's ID.
- Each burst sits a small, neat distance off that channel — always a multiple of **150 Hz**. That
  distance ÷ 150 is an integer **code**
  - data burst : `data_code = (data_burst_freq − n·3500) / 150`
  - preamble burst : `pre_code`

---

## 4. Removing night owls and speed clickers

Plotting data‑tone frequency vs. time shows ~15 students, each parked on a constant channel
and transmitting a short burst of clicks in a roughly **1.3 s time slot**, in sequence. It's time to remove the Night Owls and Speed Clickers.

| class | time | bursts | students | action |
|-------|------|:------:|:--------:|--------|
| **Speed clickers** | < 2 s | **4** (+ t=2.002) | ~2 | drop (random mashing) |
| **Legitimate** | 2–15 s | **68** | **11** | keep — the message |
| **Night owls** | > 15 s | **8** | ~3 | drop (replays) |

If the center tone started before 2 sec, I've sorted it as a Speed Clicker. If the center tone started before 15 sec, I've sorted it as the Legitimate.

That leaves **11 legitimate students**, on channels `n = -3, -13, -21, -25, -27, -28, -20, 5, -12, 24, 27`, with **68 bursts** between them. 

![Step 4 — bursts colored by arrival-time class](/assets/content/writeup/ctf/defcon2026_qual/step4_classify.png)
*Bursts by class: **green** = the **11 legit students** (kept); **orange** = >15 s night‑owl replays (drop); **red** = speed‑clickers (drop).*

---

## 5. Narrowing the legit bursts to the answers

- **61 click candidates** = 68 legit bursts − 7 broadband pulses (wideband)
  - **Keep 28** (`pre_code == 9`)
  - **drop 33** (`pre_code ≠ 9`)

![Step 5 — the 61 click candidates colored by pre_code](/assets/content/writeup/ctf/defcon2026_qual/step5_precode.png)
*The **61 click candidates** = **7 broadband pulses** + **28 green `pre_code = 9` (the real answers)** + **33 gold `pre_code ≠ 9` (decoys)**.

---

## 6. The decode

The 28 `pre_code == 9` answers' data codes are a **linear** map onto ASCII:

```
codepoint = round( 95 + (data_code·150 + 2250) / 150.8 )
```

- Code **−15 → `_`** (space) && codes **−13 … +12 → `a` … `z`**. 
- Codes that land **outside** the printable `a…z`/`_` band are not used.

⬇️Below is the "Out of range" clicks. (`pre_code = 9`, but out of range)

| data_code | codepoint | |
|---:|---:|---|
| `+39` | 149 | beyond printable ASCII (≥ 127) |
| `+35` | 145 | beyond printable ASCII (≥ 127) |
| `−36` | 74 | `J` — valid ASCII, but **uppercase** |
| `−37` | 73 | `I` — valid ASCII, but **uppercase** |

![Step 6 — decoded ASCII at each answer click](/assets/content/writeup/ctf/defcon2026_qual/step6_decode.png)
*Each `pre_code = 9` click rendered as its **decoded ASCII character** — the **24** green letters/spaces spell the message reading; **red ✕** = the 4 out‑of‑range; **gold** = the 33 `pre_code ≠ 9` decoys. 

```
owl_sleeps_but_not_robin          ('_' = the space code, −15)
```

---

## 7. Final answer

```
message = owl sleeps but not robin
flag    = bbb{owl_sleeps_but_not_robin}
```

---

## 9. Review

I'm not sure whether the signal could be called **FHSS**. Since students use their own frequency channels, I think it's closer to FDMA (Frequency Division Multiple Access). But overall the challenge was fun to solve. Happy to see a RF challenge in such a big CTF.