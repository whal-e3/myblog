---
title: "Simple Crack Me 2"
description: ""
date: 2024-08-20
draft: false
starred: false
tags: ["wargame", "dreamhack", "reversing"]
comments: false
---

![스크린샷 2024-08-20 024549.png](/assets/content/blog/simple-crack-me-2/screenshot_2024-08-20_024549.png)

파이썬이 data type 구분이 없어서 약간 헤맨 문제...

## Solution

```python
data = [
    0xf8, 0xe0, 0xe6, 0x9e, 0x7f, 0x32, 0x68, 0x31, 0x05, 0xdc, 0xa1,
    0xaa, 0xaa, 0x09, 0xb3, 0xd8, 0x41, 0xf0, 0x36, 0x8c, 0xce, 0xc7,
    0xac, 0x66, 0x91, 0x4c, 0x32, 0xff, 0x05, 0xe0, 0xd9, 0x91
]

key1 = [0x11, 0x33, 0x55, 0x77, 0x99, 0xbb, 0xdd]
key2 = [0xef, 0xbe, 0xad, 0xde]
key3 = [0xde, 0xad, 0xbe, 0xef]

# func_xor
for i in range(len(data)):
    data[i] = data[i] ^ key1[i%len(key1)]

# func_add
for i in range(len(data)):
    data[i] = data[i] - 0xf3
    if data[i] < 0:
        data[i] += 256

# func_sub
for i in range(len(data)):
    data[i] = data[i] + 0x4d
    if data[i] > 255:
        data[i] -= 256

# func_xor
for i in range(len(data)):
    data[i] = data[i] ^ key2[i%len(key2)]

# func_sub
for i in range(len(data)):
    data[i] = data[i] + 0x5a
    if data[i] > 255:
        data[i] -= 256

# func_add
for i in range(len(data)):
    data[i] = data[i] - 0x1f
    if data[i] < 0:
        data[i] += 256

# func_xor
for i in range(len(data)):
    data[i] = data[i] ^ key3[i%len(key3)]

# Print flag
for i in range(len(data)):
    print(chr(data[i]), end="")
print()
```
