---
title: "I/O buffering"
description: ""
date: 2024-06-25
draft: false
starred: false
tags: ["hacking", "language"]
comments: false
---

![Buffer_(application)_logo.png](/assets/content/blog/i-o-buffering/Buffer_application_logo.png)

After solving the  “iofile_aw” wargame from dreamhack.io, I found out that `_IONBF` is not exactly NO Buffer but rather using just 1-byte. (Hence making the buffer to flush on every input byte.)

I got curious and thought, “What’ll happen if the buffer is set to Full or Line?”

```c
// gcc -o test test.c -no-pie -fno-pie
#include <stdio.h>
#include <unistd.h>

void initialize() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
}

int main() {
	// initialize();

	printf("hello buffer");
	sleep(3);

	return 0;
}
```

### I tested two scenarios with the code above.

1. When will `“hello buffer”` be printed when `initialize()` is enabled?
2. When will `“hello buffer”` be printed when `initialize()` is disabled? Or will it be printed in the first place?

### The result was interesting!

For the question no.1, the code kind of speaks for itself. `“hello buffer”` is printed right after the `printf()` is executed.

But for the Q no.2, the logical result for me was the code *Not printing anything at all*. Because buffer is obviously not full yet!

But the `"hello buffer"` was printed after 3 sec of `sleep()` !

## pwndbg

While going through the `printf("hello buffer");` ,  `__vfprintf_internal` was called and `_IO_2_1_stdout_` was updated like below. (Original value of `_IO_buf_base` and other `_IO_` values were 0)

![스크린샷 2024-06-25 013359.png](/assets/content/blog/i-o-buffering/screenshot_2024-06-25_013359.png)

![스크린샷 2024-06-25 013518.png](/assets/content/blog/i-o-buffering/screenshot_2024-06-25_013518.png)

The string is not yet printed!

- At the end of the asm, `exit()` is called.
    - Inside the `exit()` , `_IO_cleanup` is called.
        - Inside the `_IO_cleanup` , `_IO_flush_all_lockp` is called.

with this process the address of `"hello buffer"` is passed to the `rsi` . 

The string is then printed to the console using `SYS_write` and IO is cleaned up by `_IO_cleanup` .

---

참고로 Ubuntu 22.04 환경에서는 

- stdin 의 `_flags` 는 **0xfbad2088**
- stdout 의 `_flags` 는 0xfbad2084

로 둘 모두 File Buffer 즉 Full Buffer(0x2000) 를 default 로 사용했다.

`uname -r`  : 6.5.0-35-generic
