---
title: "Twist1"
description: ""
date: 2024-08-04
draft: false
starred: false
tags: ["wargame", "reversing.kr", "pwnable"]
comments: false
---

![스크린샷 2024-08-04 020301.png](/assets/content/blog/twist1/screenshot_2024-08-04_020301.png)

Twist1.zip 이 주어지는데 웃긴게 이거 풀면 ReadMe.txt 랑 Twist1.exe 파일이 생성되었다가 조금 지나면 Twist1.exe 는 자동 삭제됨.

이건 Windows 바이러스 검사 켜있어서 그런거였네 ㅎ..

### ReadMe.txt

```c
Twist1.exe is run in x86 windows.
```

IDA 로 분석해보는 데 처음에 main 이랄 것도 없고 start 부터 시작하며,

start → sub_407030 → sub_407024 로 넘어가면서 아래 로직이 나온다.

![스크린샷 2024-08-05 093740.png](/assets/content/blog/twist1/screenshot_2024-08-05_093740.png)

빨간 bp 아래 줄을 읽으면 loc_40702F 에 0x0E 를 넣어서 루프 돌았을 때 다시 loc_407035 로 돌아오지 않도록 한다.

![스크린샷 2024-08-05 093553.png](/assets/content/blog/twist1/screenshot_2024-08-05_093553.png)

![스크린샷 2024-08-05 093601.png](/assets/content/blog/twist1/screenshot_2024-08-05_093601.png)

05 에서 0E 로 바뀌면서 jmp 주소가 loc_407035 → loc_40703E 가 되었다.
