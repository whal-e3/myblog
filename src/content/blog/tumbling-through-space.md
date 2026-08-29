---
title: "Tumbling Through Space"
description: "STARPWN CTF writeup — detumbling a satellite by cancelling its angular momentum with a single capped thruster burn."
date: 2026-08-21
draft: true
starred: false
tags:
  - ctf
  - space
  - adcs
  - dynamics
comments: true
---

<figure style="text-align: center;">
  <img src="/assets/content/writeup/starpwn/tumbling-through-space/challenge.png"
       alt="Tumbling Through Space challenge card — Space Operations; interactive target that reports a satellite's inertia, angular velocity and angular momentum"
       style="max-width: 640px; width: 100%;" />
  <figcaption><em>Tumbling Through Space · Space Operations · ~475 pts · 128 solves</em></figcaption>
</figure>

---

## Challenge

An interactive TCP target, no file. The server prints the satellite's moments of inertia, angular
velocities and angular momentum, then reads four numbers — `Tx Ty Tz duration`. Torques in N·m,
`0 < duration ≤ 100`, and the **torque vector magnitude is capped at 1.0 N·m**. You win at
`|ω| < 0.01 rad/s`. Five attempts per connection; each reconnect rolls a fresh random tumble.

---

## Background — rotational mechanics

I needed to refresh this before anything made sense. Every rotational quantity has a straight-line
twin:

| straight line | rotating | |
|---|---|---|
| speed `v` | **angular velocity `ω`** | how fast it turns, rad/s |
| mass `m` | **moment of inertia `I`** | how hard it is to turn, kg·m² |
| momentum `p = m·v` | **angular momentum `L = I·ω`** | how much turning there is |
| force `F` | **torque `T`** | a twisting push, N·m |

- **ω** — it tumbles about three axes at once, and `|ω|` is the 3D length of those three numbers.
  One turn is 2π ≈ 6.28 rad, so `|ω| = 0.54` is about one rotation every 12 s. The target,
  `|ω| < 0.01`, is roughly one turn per 10 minutes — basically stopped.
- **I** — differs per axis, because a satellite is a box with panels, not a ball. Like a pencil:
  easy to twirl about its long axis, hard end-over-end. One state I saw had `Izz = 19.98` vs
  `Ixx = 12.10`.
- **L = I·ω** — the thing that actually matters. **This is what I have to drive to zero, not `ω`.**
  Same angular velocity about a heavy axis carries more momentum than about a light one, so killing
  `ω` component-by-component is the wrong target. `L` is also what the thrusters change.

The inertia tensor is diagonal here, so `L = (Ixx·ωx, Iyy·ωy, Izz·ωz)`. The server prints
`Lx, Ly, Lz` for me, so I just use those instead of recomputing `I·ω` — no chance of an
axis-ordering or unit slip. (They match anyway.)

Torque `T` is capped at `|T| ≤ 1.0 N·m` on the whole 3D vector, not per component.

---

## 1. One equation, one free choice

```
ΔL = T · t          twist × how long you apply it = change in momentum
```

To stop, remove all of it — `ΔL = −L`:

```
−L = T · t
```

Two unknowns, one equation: a weaker torque just means a longer burn. So I fix the direction and
spend the whole thruster budget, which also gives the shortest burn:

```
direction   T̂ = −L / |L|          point straight against the momentum
magnitude   T  = T_MAX · T̂         full budget
duration    t  = |L| / T_MAX
```

---

## 2. The recipe, worked

From the three printed `L` components:

```
1. |L| = sqrt(Lx² + Ly² + Lz²)
2. Tx,Ty,Tz = -L / |L| × 0.999          reverse it, scale to thruster strength
3. duration = |L| / 0.999
```

Why `0.999` and not the full `1.0`? Exactly `1.0` kept getting rejected:

```
>>> 0.574679 -0.469300 -0.670449 7.055851
ERROR: Torque magnitude exceeds thruster capability (max 1.0 N*m)
```

I didn't catch this myself — an AI did. Printed to 6 decimals, a clean unit vector squares-and-sums
to **1.0000002**, and the server rejects anything strictly *above* 1.0. Back off to **0.999** and
it's fine — burn is 0.1% longer, nothing else changes.

On a live instance:

```
Lx = +2.437928     Ly = +1.662105     Lz = +5.842949

|L| = sqrt(5.943493 + 2.762593 + 34.140053) = sqrt(42.846139) = 6.545696

Tx = -2.437928 / 6.545696 × 0.999 = -0.372075
Ty = -1.662105 / 6.545696 × 0.999 = -0.253669
Tz = -5.842949 / 6.545696 × 0.999 = -0.891747
t  =  6.545696 / 0.999            =  6.552248

>>> -0.372075 -0.253669 -0.891747 6.552248
```

`Tz` is the biggest because Z holds ~80% of the momentum (`5.84²` = 34 of the 42.8), so the burn
points mostly along −Z.

Quick sanity checks before sending:

| check | why |
|---|---|
| every `T` has the **opposite sign** to its `L` | pushing back, not adding spin |
| the **rounded** components' magnitude ≤ 1.0 | the cap is strict (above) |
| `duration` slightly **larger** than `\|L\|` | because it is `\|L\| / 0.999` |

---

## 3. What the model ignores

Euler's equations mean `ω × (I·ω)` slowly reorients `L` during a finite burn, so nulling the
momentum vector isn't exact. Doesn't matter here — the threshold is `|ω| < 0.01`, not zero, and you
get five attempts. My residual was 0.0032 rad/s (3× inside tolerance); a second burn would clean up
anything left.

Two edge cases:

- **`|L| > 100 N·m·s` can't be done in one burn.** Ceiling is 1 N·m × 100 s = 100 N·m·s. Send
  `duration = 100` and repeat on the next prompt.
- **After a rejection the server re-prompts without reprinting telemetry.** State is unchanged, so
  reuse the same `L`. A parser that expects fresh telemetry every round will hang.

---

## 4. Solve

The solver is four lines:

```python
T_MAX = 0.999          # NOT 1.0 - see step 2
DUR_MAX = 100.0

def solve(Lx, Ly, Lz):
    L = math.sqrt(Lx*Lx + Ly*Ly + Lz*Lz)
    dur = min(L / T_MAX, DUR_MAX)
    return -Lx/L*T_MAX, -Ly/L*T_MAX, -Lz/L*T_MAX, dur, L
```

`autoplay.py` wraps it in a socket client: connect, regex `Lx/Ly/Lz` out of the banner, compute,
send, read the result. One burn, first attempt:

<figure style="text-align: center;">
  <img src="/assets/content/writeup/starpwn/tumbling-through-space/flag.png"
       alt="Detumbling target output — |omega| 0.003207, SATELLITE STABILIZED, flag printed"
       style="max-width: 560px; width: 100%;" />
</figure>

```
Angular Velocity (rad/s):
  omega_x = +0.001227   omega_y = +0.000771   omega_z = +0.002860
  |omega|  = 0.003207
Rotational Energy: 0.000084 J

SUCCESS! SATELLITE STABILIZED!
Here is your flag: STARPWN{d3tumbl3_m4st3r_sp4c3_0p5}
```

`|ω|` dropped to 0.003207 — about 3× inside the 0.01 threshold. A different random tumble on an
earlier run also went down in one burn (`|ω| 0.487821 → 0.001617`), so the recipe doesn't need any
per-scenario tuning.

> 🚩 STARPWN{d3tumbl3_m4st3r_sp4c3_0p5}
