---
title: "Silent Beacon"
description: "STARPWN CTF writeup — recovering a flag from CubeSat telemetry packets that violate their own CCSDS spec."
date: 2026-08-21
draft: false
starred: false
tags:
  - ctf
  - space
  - rf
  - ccsds
  - forensics
comments: true
---

<figure style="text-align: center;">
  <img src="/assets/content/writeup/starpwn/silent-beacon/challenge.png"
       alt="Silent Beacon challenge card — Space Communications & RF; raw CCSDS packets buried in line noise with multiple APIDs interleaved"
       style="max-width: 640px; width: 100%;" />
  <figcaption><em>Silent Beacon · Space Communications &amp; RF · 454 pts · 171 solves</em></figcaption>
</figure>

---

## Challenge

Three files: `capture.bin` (5,835 B, the raw telemetry burst), `packet_ids.txt` (ASM value + CCSDS
framing + APID directory) and `telemetry_dictionary.json` (field layouts — APID 100 complete,
APID 200 a stub).

---

## 1. Parsing the CCSDS framing

Each packet is wrapped in an attached sync marker from the layer below:

```
[4B ASM 0x1ACFFC1D][6B CCSDS primary header][user data]
```

`packet_ids.txt` states the ASM and the framing outright, so there is no format to reverse — read
it and go. Searching for the ASM makes the inter-packet filler irrelevant, since the noise never
contains the marker. That finds **124 markers, 124 well-formed CCSDS v0 headers, zero rejects.**

*(Cross-check, run afterwards rather than to find anything: a 4-gram histogram over the raw file
puts `1acffc1d` at 124 occurrences and `fc1d0064`/`fc1d00c8`/`fc1d0032` at 89/21/14 — recovering the
marker and all three APIDs without the documentation. Worth knowing the file is self-describing if
a supplied spec ever turns out to be the red herring.)*

So nothing at the protocol level is wrong. A CCSDS-aware tool would report a perfectly clean
capture. CCSDS defines how to *frame and route* a packet; it says nothing about what the bytes
inside mean, because that is mission-defined. **The anomaly is one layer below anything the
protocol can check.**

One framing trap: the length field stores *length − 1*. `strings` shows `GPS LOCK 4SVSF`, but the
declared length is 13 and the payload is `GPS LOCK 4SVS` — the trailing `F` (`0x46`) is the first
filler byte, printable by luck. Trust the length field, never the text.

---

## 2. The three APID streams

The headers demultiplex into three APIDs:

| APID | mnemonic | packets | payload |
|--:|---|--:|---|
| 50 | SYSLOG | 14 | variable ASCII |
| 100 | HK_NOMINAL | 89 | 14 B fixed, **fully documented** |
| 200 | ADCS_STATUS | 21 | 8 B, *"field layout not yet recovered"* |

Both of the others are bait, and it is worth naming why:

- **APID 50** is readable ASCII — the obvious hiding place, so nothing is hidden there. Its 14
  messages are ordinary ops chatter, several repeated verbatim.
- **APID 200** is undocumented, which makes it the most tempting thing in the archive. It is 168
  bytes of filler. An undocumented binary field is a trap precisely because you can never prove
  you decoded it *wrong*.

APID 100 is the one to attack — not because flags live in housekeeping, but because **it is the
only stream where you can tell right from wrong.**

---

## 3. Decoding against the telemetry dictionary

`telemetry_dictionary.json` gives APID 100 in full, `struct_format` included:

```
off  size  field          type     scale    units   notes
  0    2   sequence_id    uint16                    ORDER BY THIS - wire order is shuffled
  2    2   temp_obc       int16    x0.1     degC    signed: can go negative
  4    2   temp_battery   int16    x0.1     degC
  6    2   temp_solar     int16    x0.1     degC
  8    2   voltage_bus    uint16   x0.001   V
 10    2   current_bus    uint16   x0.1     mA
 12    1   mode           uint8                     valid_range [0,7]   <- THE CONSTRAINT
 13    1   error_flags    uint8                     bit 7 = ANOMALY     <- second tell
```

Signedness matters: temperatures are `h` (signed) so they can read negative, voltage and current
are `H` (unsigned). Get it wrong and `temp_solar = -50.8 °C` becomes +6502.8 °C.

`mode` names 8 states — SAFE, NOMINAL, SCIENCE, COMMS, ATTITUDE, THERMAL, POWER, DIAGNOSTIC — so
any value above 7 is meaningless as telemetry. **That declared range is the whole challenge.** It
is the only thing in the archive that defines an illegal value, which is what a planted byte looks
like. This is what a real telemetry dictionary is for: ground software uses exactly these limits to
flag out-of-range telemetry automatically.

**29 of the 89 HK packets carry a `mode` outside [0,7]** — and each is an ASCII code.

---

## 4. The planted packets

```
LEGAL    03e8 00a1 00ba 01d0 1d79 00b7 00 00
         seq=1000  obc=16.1  batt=18.6  solar=+46.4  7.545V  18.3mA   mode=0 SAFE       err=0x00

LEGAL    03ec 0101 0091 fc2b 1d70 006e 07 01
         seq=1004  obc=25.7  batt=14.5  solar=-98.1  7.536V  11.0mA   mode=7 DIAGNOSTIC err=0x01

PLANTED  03ea 00e5 00b4 00e5 1cd1 009a 53 9a
         seq=1002  obc=22.9  batt=18.0  solar=+22.9  7.377V  15.4mA   mode=0x53 'S'     err=0x9a

PLANTED  03f0 00c9 00a9 050e 1d31 0088 54 e9
         seq=1008  obc=20.1  batt=16.9  solar=+129.4 7.473V  13.6mA   mode=0x54 'T'     err=0xe9

PLANTED  03f4 00ea 00de fe04 1d1b 0097 41 90
         seq=1012  obc=23.4  batt=22.2  solar=-50.8  7.451V  15.1mA   mode=0x41 'A'     err=0x90
```

Every other field is indistinguishable — temperatures, voltage and current all read as plausible
telemetry in the planted packets too. **Only the second-to-last byte gives them away.**

`error_flags` is an independent second discriminator. The dictionary names bit 7 `ANOMALY`, and it
separates the groups perfectly on its own:

```
legal    bit7 set in  0 / 60      values {0x00, 0x01, 0x04, 0x10, 0x21}, 0x00 on 42 of 60
planted  bit7 set in 29 / 29      28 distinct values, all >= 0x80
```

The same 29 packets are findable from that column without ever checking `mode`.

---

## 5. Ordering by sequence_id

The packets are shuffled on the wire, so order by the payload's own `sequence_id`. In file order
you get every correct character in the wrong arrangement:

```
file order  pSAP3Tn0s3}Nn{l4Rm0gWkyhu4_31
sorted      STARPWN{h0us3k33p1ng_4n0m4ly}
```

That reads as a failed decode rather than a sorting bug — the easiest hour to lose here. 29 illegal
packets, 29 characters: the count matching exactly confirms no false positives.

---

## 6. Solve

```python
ASM = bytes.fromhex("1ACFFC1D")

def packets(data):
    i = data.find(ASM)
    while i != -1:
        w0, w1, w2 = struct.unpack(">HHH", data[i + 4:i + 10])
        yield dict(apid=w0 & 0x7FF, seq=w1 & 0x3FFF,
                   body=data[i + 10:i + 10 + w2 + 1])      # +1: field stores length-1
        i = data.find(ASM, i + 1)

pk   = list(packets(open("capture.bin", "rb").read()))
hk   = [p for p in pk if p["apid"] == 100]
rows = [struct.unpack(">HhhhHHBB", p["body"]) for p in hk]  # dictionary's struct_format

bad  = sorted(r for r in rows if not 0 <= r[6] <= 7)        # violates valid_range; sorts by seq_id
print("".join(chr(r[6]) for r in bad))                      # braces are in the mode bytes too
```

`decode.py` is this plus a report on all three APIDs:

```
$ python3 decode.py
[APID 50] SYSLOG, 14 packets in sequence order:
     0  BATT CHARGE 87%
     1  INIT OK
    ...
    13  SUN VECTOR ACQUIRED

[APID 100] HK_NOMINAL, 89 packets
    mode inside documented valid_range [0,7] : 60
    mode OUTSIDE valid_range                 : 29

    those mode bytes, ordered by sequence_id, as ASCII:
    STARPWN{h0us3k33p1ng_4n0m4ly}

[APID 200] ADCS_STATUS, 21 packets, layout undocumented
    24682724c6206148497c854ccb0a6160d61353d7b8bed808...
```

`sorted()` on the unpacked tuples sorts by the first element, `sequence_id` — which is why step 5
comes free.

> 🚩 STARPWN{h0us3k33p1ng_4n0m4ly}
