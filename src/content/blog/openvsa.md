---
title: "OpenVSA — An Open-Source Virtual Satellite Ground Station"
description: "An open-source satellite ground station simulator — practice signal reception, tracking, and uplink command transmission without any hardware."
date: 2026-04-23
draft: true
starred: false
tags: []
comments: true
---

OpenVSA is an open-source satellite ground station simulator that lets you practice satellite signal reception, tracking, and uplink command transmission — without any hardware.

It simulates the full RF chain from satellite to antenna to SDR, including realistic signal propagation physics, real-time waterfall displays, and GPredict integration for live satellite tracking.

> **GitHub:** [github.com/whal-e3/OpenVSA](https://github.com/whal-e3/OpenVSA)

<!-- IMAGE 1: Main window screenshot — OpenVSA with waterfall active, DEMOSAT selected, signal visible on the spectrum -->

---

## How the RF Environment Is Simulated

OpenVSA doesn't just play back a recorded signal file — it models the entire signal path from satellite to ground station, applying real physics at every step. Here's how each stage works.

### Signal Power: EIRP and Free-Space Path Loss

The starting point is the satellite's **EIRP** (Effective Isotropic Radiated Power). As the signal travels from orbit to the ground station, it loses power according to the **Free-Space Path Loss** formula:

$$
\text{FSPL (dB)} = 20 \log_{10}(d) + 20 \log_{10}(f) + 20 \log_{10}\left(\frac{4\pi}{c}\right)
$$

Where *d* is the slant range in meters (computed in real time via SGP4 orbit propagation) and *f* is the downlink frequency in Hz. A LEO satellite at 400 km altitude and 401.5 MHz loses roughly 145 dB of signal power just from distance alone.

### Antenna Beam Attenuation

Your antenna isn't always pointed perfectly at the satellite. OpenVSA models this with a **Gaussian beam pattern**:

$$
G(\theta) = G_{\text{peak}} - 12 \left(\frac{\theta}{\theta_{3\text{dB}}}\right)^2
$$

Where *θ* is the angular offset between the antenna boresight and the satellite, and *θ₃dB* is the antenna's half-power beamwidth. A yagi with a 25° beamwidth drops -3 dB at 12.5° off-axis and reaches -12 dB at the full beamwidth.

For dish antennas, the gain is frequency-dependent rather than fixed:

$$
G_{\text{dish}} = \eta \left(\frac{\pi D}{\lambda}\right)^2
$$

With efficiency η = 0.55 and diameter D = 0.75 m. The same dish has vastly different gain at L-band vs Ku-band — and OpenVSA enforces this with a **feed selector**: each dish feed (L/S/Ku) only works in its frequency range. Mount a Ku-band feed and try to receive a UHF signal? You get nothing.

<!-- IMAGE 2: Diagram showing beam pattern (polar plot) with satellite at various offset angles -->

### Doppler Shift

As the satellite moves toward or away from the ground station, the signal frequency shifts. OpenVSA computes this using the range rate from SGP4:

$$
\Delta f = -f_0 \cdot \frac{v_r}{c}
$$

Where *v_r* is the radial velocity (km/s) between satellite and observer. For a LEO satellite at 401.5 MHz, this produces shifts of up to ±10 kHz — clearly visible on the waterfall as the signal drifts during a pass.

### Polarization Mismatch

Real satellite antennas have specific polarization. OpenVSA applies polarization loss between the satellite and ground antenna:

| Satellite → Antenna | Loss |
|---------------------|------|
| Matched (e.g. RHCP → RHCP) | 0 dB |
| Circular ↔ Linear | -3 dB |
| Cross-polarized (RHCP → LHCP) | -60 dB (blocked) |

Pick the wrong antenna for your satellite and you'll see exactly how much signal you lose.

### Atmospheric Loss

At low elevation angles, the signal passes through more atmosphere. OpenVSA models this as:

$$
L_{\text{atm}} = \frac{A_{\text{zenith}}}{\sin(\text{elevation})}
$$

With a zenith loss of 2 dB. At 5° elevation this becomes ~23 dB — making low-angle passes significantly harder to receive, just like in the real world.

### The Complete Signal Chain

Putting it all together, what you see on the waterfall is:

$$
P_{\text{rx}} = \text{EIRP} - \text{FSPL} + G(\theta) - L_{\text{atm}} - L_{\text{pol}} + G_{\text{SDR}}
$$

The IQ samples from the signal file are scaled by this combined amplitude, mixed with Gaussian noise (which itself responds to the SDR gain setting), and clipped at ±1.0 to simulate ADC saturation — exactly what a real SDR would produce.

<!-- IMAGE 3: Block diagram of the signal chain: Satellite → FSPL → Beam → Atmosphere → Polarization → SDR Gain → Waterfall -->

---

## OpenVSA vs VSA

OpenVSA is derived from **VSA** (Virtual Satellite Antenna), a proprietary ground station simulator used in satellite security training exercises.

| | VSA | OpenVSA |
|---|-----|---------|
| **License** | Proprietary | GPLv3 (open source) |
| **Satellites** | Multiple (encrypted signals) | DEMOSAT (extensible) |
| **Signal files** | AES-256-GCM encrypted | Plain `.cf32`, SHA-256 validated |
| **Custom satellites** | No | Yes — add your own via config files |
| **Core physics** | Same | Same |

The core simulation engine — beam attenuation, Doppler, FSPL, polarization, streaming recording, waterfall rendering, satellite state machine — is identical. The key difference is that OpenVSA is designed to be extensible: you can add your own satellites with custom signal files, protocols, and decoders.

<!-- IMAGE 4: Side-by-side comparison screenshot — VSA (left) vs OpenVSA (right) showing the same view -->

---

## How to Use OpenVSA

### Setup

```bash
git clone https://github.com/whal-e3/OpenVSA
cd OpenVSA
npm install
npm run electron
```

Requirements: Node.js v18+, Python 3 (optional, for uplink decoding).

### Receiving a Signal

1. Select a satellite from the dropdown
2. Load the satellite's `.cf32` IQ signal file when prompted (OpenVSA validates it against a SHA-256 hash)
3. Set the SDR frequency and sample rate to match the satellite
4. Pick an antenna (Yagi, Dish, Dipole, or Helix) and point it (azimuth + elevation sliders)
5. The waterfall and spectrum displays update in real time

When the antenna is pointed correctly, the signal appears on the waterfall. Move it off-axis and watch the signal fade — that's the beam attenuation model at work.

<!-- VIDEO 1: Screen recording — selecting DEMOSAT, loading signal, adjusting antenna, signal appearing/fading on waterfall -->

### Recording IQ Data

Hit the **REC** button to start capturing. OpenVSA streams IQ data directly to disk in real time (no memory accumulation, so you can record for as long as you want), producing a `.cf32` file and a `.sigmf-meta` companion with full metadata — antenna position, satellite position, Doppler, gain, beam attenuation, and observer coordinates.

### GPredict Integration

Connect [GPredict](http://gpredict.oz9aec.net/) for automated satellite tracking:

- Rotator control on port **4533** (antenna follows the satellite automatically)
- Radio control on port **4532** (frequency tracks Doppler correction)
- Ground station location is read from GPredict `.qth` files automatically

<!-- IMAGE 5: GPredict window showing satellite pass alongside OpenVSA receiving the signal -->

### Adding Your Own Satellite

You can add any satellite by creating:

1. **Signal file** — A `.cf32` IQ recording of the satellite's downlink
2. **Config entries** — RF parameters in `src/data/satellites.js` and `electron/config.js` (including SHA-256 hash for integrity validation)
3. **TLE data** — Orbital elements in `tle.txt`
4. **Satellite directory** — `satellites/<name>/` with hardware definitions (`hardware.json`), telemetry panel layout (`panel.json`), command protocol spec (`c2protocol.json`), and an optional Python decoder (`decoder.py`) for uplink commands

See [MANUAL.md](https://github.com/whal-e3/OpenVSA/blob/main/MANUAL.md) for the full step-by-step guide with examples.

<!-- IMAGE 6: File tree showing the satellite directory structure (hardware.json, panel.json, c2protocol.json, decoder.py) -->

### Sending Uplink Commands

Switch to the **UPLINK** tab to transmit commands. OpenVSA validates the uplink physics in real time:

- Antenna beam coupling vs satellite position
- Power amplifier frequency range matching
- Free-space path loss vs receiver sensitivity
- Above-the-horizon check

If your uplink is geometrically and power-wise feasible, OpenVSA decodes the command IQ file via the satellite's Python decoder and applies the command to the simulated satellite state.

---

## The Demo Satellite

OpenVSA ships with **DEMOSAT** — a fictional LEO CubeSat designed to demonstrate all features of the simulator.

| Parameter | Value |
|-----------|-------|
| Downlink | 401.5 MHz (UHF) |
| Uplink | 449.5 MHz (TT&C) |
| Orbit | 51.6° inclination, ~400 km altitude |
| Modulation | OOK, 100 baud |
| Polarization | Linear |
| Sample rate | 24 kHz |

DEMOSAT includes a full satellite state engine with telemetry (battery, solar panels, ADCS, OBC), a command protocol with CRC-8 validation, and a Python decoder for uplink commands. It's a good starting point for understanding how all the pieces fit together before adding your own satellite.

<!-- IMAGE 7: OpenVSA with DEMOSAT selected, showing the telemetry panel and waterfall with signal visible -->

---

## Links

- **Source code:** [github.com/whal-e3/OpenVSA](https://github.com/whal-e3/OpenVSA)
- **Manual:** [MANUAL.md](https://github.com/whal-e3/OpenVSA/blob/main/MANUAL.md)
- **License:** GPLv3 for personal/educational use

---

*Built by SunHyuk Hwang*
