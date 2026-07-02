---
title: "Public"
description: ""
date: 2024-09-09
draft: false
starred: false
tags: ["wargame", "dreamhack", "crypto", "reversing"]
comments: false
---

![스크린샷 2024-09-09 194528.png](/assets/content/blog/public/screenshot_2024-09-09_194528.png)

### 제공 파일

- out.bin
- out.txt : 암호화 중 나온 n1, n2 값을 적어놓은 파일
    - n1 = 4271010253
    - n2 = 201326609
- public : 암호화 바이너리

## main() logic

1. `n.txt` 입력으로 받아서 안에 두 숫자 추출(unsigned) - 해당 숫자는 brute forcing 으로 알아냄. ~~근데 필요없음 ㅋ…~~
    1. org1 = 65281 
    2. org2 = 201326609
2. while 문에서 org1 에 대해 대량의 연산 진행 하고 그 결과를 `n1` 으로 설정
    1. n1 = 4271010253
3. while 문에서 org2 에 대해 대량의 연산 진행 하고 그 결과를 `n2` 으로 설정
    1. n2 = 201326609
4. `flag.txt` 읽어오기
    1. flag 길이는 4의 배수여야 함.
5. 읽은 flag를 4byte 씩 끊어서 n1, n2 와 같이 연산(`sub_1289()`)한 다음 `out.bin` 에 8byte 씩 쓰기
    1. e.g. 40e1dcd4 00000000 

## sub_1289()

![스크린샷 2024-09-09 205515.png](/assets/content/blog/public/screenshot_2024-09-09_205515.png)

There’s a thing called **“Modulation exponentiation”** which is essentially… 

> **A^B % C = ( (A % C)^B ) % C**
> 

or

> **(a ⋅ b) % m = [(a % m) ⋅ (b % m)] % m**
> 

which is like below in this quesiton.

> **A^A % C = ( (A % C)^A ) % C**
> 

**Modulation exponentiation is used in both Diffie–Hellman key exchange and RSA public/private keys**

따라서 해당 for loop 은 아래와 같이 표현 가능.

(flag_4byte)^n2 % n1 = flag_enc_4byte

그러나 flag_4byte 를 계산하는 것은 일반적으로 어려운 일.

n1 = 4271010253 = 65287 * 65419

n2 = 201326609 = 11 * 307 * 59617

# How does the RSA works?

- 임의의 소수 2개
    - p = 7, q = 11
    - n = 77 (p * q)
- φ(n)
    - n과 서로소이면서 n보다 작은 수의 개수
    - n이 두 서로소의 곱일 때 (p-1)(q-1) 와 동일
    - = 60
- 공개키 (pub_key)
    - φ(n) 보다 작은 φ(n)과 서로소인 수 선택
    - = 7
- 개인키 (priv_key)
    - (pub_key) * (priv_key) ≡ 1 (mod φ(n))
    - 7 * (priv_key) % 60 = 1 인 수 찾기 = 43
- 메세지 암호화 : msg ^ (pub_key) % n = enc_msg
- 메세지 복호화 : enc_msg ^ (priv_key) % n = msg

# how to solve

해당 문제는 개인키만 알면 복호화 가능.

따라서 개인키 구하는 방법에 수 적용하면

n = n1 = 4271010253 = 65287 * 65419

pub_key = n2 = 201326609

φ(n) = (65287-1) * (65419-1) = 4270879548

**(pub_key)*(priv_key) ≡ 1 (mod φ(n)) → (priv_key)*201326609 ≡ 1 mod 4270879548**

## private key 찾기

(priv_key)*201326609 ≡ 1 mod 4270879548

(priv_key)*201326609 를 4270879548 로 나누었을 때 나머지가 1이 되게 하는 *priv_key*

```python
#!/usr/bin/env python3
def modular_exponentiation(base, exponent, modulus):
    if exponent == 0:
        return 1
    elif exponent % 2 == 0:
        result = modular_exponentiation(base, exponent // 2, modulus)
        return (result * result) % modulus
    else:
        result = modular_exponentiation(base, exponent - 1, modulus)
        return (base * result) % modulus

f = open("out.bin", "rb")
enc_flag = f.read()

n = 4271010253
private_key = 1384538333

flag = ""
for i in range(0, len(enc_flag), 8):
    chunk = enc_flag[i:i+8][:4][::-1]
    chunk_num = int(chunk.hex(), 16)
    org = modular_exponentiation(chunk_num, private_key, n)
    org = hex(org)[2:]
    print(chr(int(org[6:8],16)), end="")
    print(chr(int(org[4:6],16)), end="")
    print(chr(int(org[2:4],16)), end="")
    print(chr(int(org[:2],16)), end="")
```

- **Private key: 1384538333**

# sol.py

- 복호화 : enc_msg ^ (priv_key) % n = msg
    - a^n % d == … a*(a*(a*(a%d)%d)%d … 원리 사용
    - 그냥 계산은 overflow… (e.g. `0x40e1dcd4 ^ 1384538333`)

```python
#!/usr/bin/env python3
def modular_exponentiation(base, exponent, modulus):
    if exponent == 0:
        return 1
    elif exponent % 2 == 0:
        result = modular_exponentiation(base, exponent // 2, modulus)
        return (result * result) % modulus
    else:
        result = modular_exponentiation(base, exponent - 1, modulus)
        return (base * result) % modulus

f = open("out.bin", "rb")
enc_flag = f.read()

n = 4271010253
private_key = 1384538333

flag = ""
for i in range(0, len(enc_flag), 8):
    chunk = enc_flag[i:i+8][:4][::-1]
    chunk_num = int(chunk.hex(), 16)
    org = modular_exponentiation(chunk_num, private_key, n)
    org = hex(org)[2:]
    print(chr(int(org[6:8],16)), end="")
    print(chr(int(org[4:6],16)), end="")
    print(chr(int(org[2:4],16)), end="")
    print(chr(int(org[:2],16)), end="")
```

🚩

![20240910_140228.jpg](/assets/content/blog/public/20240910_140228.jpg)

## Reference

RSA 암호 시스템 속 수학 원리…공개 키 암호와 공개 키 서명
