---
title: "Secret message"
description: ""
date: 2024-08-27
draft: false
starred: false
tags: ["wargame", "dreamhack", "reversing"]
comments: false
---

![스크린샷 2024-08-27 211355.png](/assets/content/blog/secret-message/screenshot_2024-08-27_211355.png)

너무 오랫동안 끊어서 문제를 풀어서 그런지는 몰라도 너무 돌아갔다.

One of the concept in reversing seems to be “The program is made by human.” which means that it has a meaning. It is not just a collection of logic and calculations…

그리고 이번에 확실히 wsl 말고 ubuntu에서 코드 돌려야 하는 이유를 알았다. 물론 따로 어떻게든 환경 만들 수 있겠지만 프로그램이 기본적으로 돌아가지를 않는다… (문제에 집중 불가.)

이 문제에서는 pillow module이 작동을 안해서 내가 잘못한건 줄 알고 꽤 해맸다.  

마지막으로 `hexdump` 말고 `xxd` 써야겠다. hexdump가 hex 순서 거꾸로 알려주는 것 때문에도 햇갈렸다. (`xxd -c 16 [파일명]`)

```python
#!/usr/bin/env python3

enc = open("secretMessage.enc", "rb")
dec = open("secretMessage.raw", "wb")

def decryptor(enc, dec):
    prev_enc_chr = None
    while True:
        curr_enc_chr = enc.read(1)
        if not curr_enc_chr:
            break
        dec.write(curr_enc_chr)
        if curr_enc_chr == prev_enc_chr:
            count = int(hex(enc.read(1)[0]),16)
            for i in range(count):
                dec.write(curr_enc_chr)
            prev_enc_chr = None
        else:
            prev_enc_chr = curr_enc_chr

decryptor(enc, dec)

enc.close()
dec.close()
```

🚩
