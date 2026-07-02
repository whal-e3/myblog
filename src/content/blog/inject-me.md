---
title: "Inject ME!!!"
description: ""
date: 2024-07-15
draft: false
starred: false
tags: ["wargame"]
comments: false
---

![스크린샷 2024-07-14 203854.png](/assets/content/blog/inject-me/screenshot_2024-07-14_203854.png)

dll : shared library file for Windows.

![스크린샷 2024-07-14 204036.png](/assets/content/blog/inject-me/screenshot_2024-07-14_204036.png)

Thought maybe the problem is related to “This program cannot be run in DOS mode”.

But it just meant that you should run the dll in Windows not in DOS env…

## IDA

DLLMain → sub_1800011A0

![스크린샷 2024-07-15 014214.png](/assets/content/blog/inject-me/screenshot_2024-07-15_014214.png)

![스크린샷 2024-07-15 014302.png](/assets/content/blog/inject-me/screenshot_2024-07-15_014302.png)

If dll is loaded by file named dreamhack.exe, the if statement runs.

### Solution

```cpp
#include <windows.h>

int main() {
    HMODULE hModule = LoadLibrary(TEXT("prob_rev.dll"));
    FreeLibrary(hModule);
    return 0;
}
```

Compile it, place it in the same directory as the dll, and run it!

![스크린샷 2024-07-15 014201.png](/assets/content/blog/inject-me/screenshot_2024-07-15_014201.png)

🚩
