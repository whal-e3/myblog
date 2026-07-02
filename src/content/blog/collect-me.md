---
title: "collect me"
description: ""
date: 2024-08-15
draft: false
starred: false
tags: ["wargame", "dreamhack", "reversing"]
comments: false
---

![스크린샷 2024-08-15 003717.png](/assets/content/blog/collect-me/screenshot_2024-08-15_003717.png)

이런식으로 func_x 마다 char 들어있음.

수동으로 하기에는 너무 많아서 IDApython 한번 시도.

```python
for i in range(928):
    func_address = idc.get_name_ea_simple(f"func_{i}")
```

위에 까지는 잘 주소 나왔으나 원하는 함수가 사용하는 stack frame 주소를 찾는 것에서 고생함. (생각해보니 바이너리 실행도 안해서 스크립트 성공했어도 안에 아무것도 없었을듯 ㅎㅎ)

`ida_frame.get_stkvar` 일부 이런 함수를 인식을 못해서 고생좀 하다가 hex view로 봐보니 바로보였음.

`AttributeError: module 'ida_frame' has no attribute 'get_stkvar'`

![스크린샷 2024-08-15 020542.png](/assets/content/blog/collect-me/screenshot_2024-08-15_020542.png)

~~그리고 이 문제인지는 모르겠는데 풀다가 argc, argv 변수 값이 stack 부분에 저장된다는 걸 알았다.~~

~~일반적인 stack 위치가 아니고 rbp~rsp 밖이었다. 뭔가 calling convention이 있는듯하다.~~

아 아니네 rdi, rsi 에 올라가네 ㅎ
