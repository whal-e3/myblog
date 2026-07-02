---
title: "batch checker"
description: ""
date: 2024-08-15
draft: false
starred: false
tags: ["wargame", "dreamhack", "misc", "reversing"]
comments: false
---

![스크린샷 2024-08-15 232049.png](/assets/content/blog/batch-checker/screenshot_2024-08-15_232049.png)

힌트없이 푸는것도 재밌네.

.bat → batch 파일

간단히 syntax 공부하니까 다음과 같았음.

```
SET               :: env 변수 세팅
cls               :: cmd 화면 clear 
%[어쩌구]%         :: "어쩌구"라는 env 변수 찾아서 값 가지고 옴.
%[어쩌구]:34,1%   :: "어쩌구"라는 env 변수값의 34번째 char에서부터 1개의 char 가져옴.
```

그리고 newline으로 command 분리.

그래서 처음엔 %[어쩌구]% 를 다 분리하려고 하다가, 보니까 `%[어쩌구]%` 가 이어서도 작동하길래 앞에 echo 만 붙임. (어떤 코드가 뒤에 숨어 있을까 확인용)

그러니 다음과 같이 나옴.

![스크린샷 2024-08-15 231953.png](/assets/content/blog/batch-checker/screenshot_2024-08-15_231953.png)

가려진 부분이 🚩
