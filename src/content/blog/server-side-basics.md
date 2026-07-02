---
title: "Server-Side basics"
description: ""
date: 2024-07-01
draft: false
starred: false
tags: ["hacking", "web-hacking"]
comments: false
---

![스크린샷 2024-07-01 120420.png](/assets/content/blog/server-side-basics/screenshot_2024-07-01_120420.png)

Interested in Web hacking. Learned some basics and here’s the summary. 

# Category

## Injection

- SQL injection
- Command injection

```bash
echo `echo hello`
# hello

$(echo $(echo hello))
# hello

&&     # 앞이 정상작동해야 뒤에도 실행 
||     # err 발생해야 뒤에 실행

;
```

- Path Traversal

`../` , `..\\` (for windows)

## SSRF

Accessing internal using external (web app)

## File Vuln

- upload 취약점
- download 취약점

webshell 로 발전 가능한 취약점 exploit

## Business Logic Vuln

- IDOR
    - → use hash with salt !
- Race condition
    - 

## Language specific Vuln

- serialize, deserialize
    - Process of converting a code into a byte stream to store it in a file/database.

e.g. python : pickler `__reduce__`

 JS : node-serialize `serialize()` , `unserialize` 

 PHP : `serialize()`

### PHP wrapper

[](https://learn.dreamhack.io/15#40)

`include()`, `fopen()`, `copy()`, `file_exists()`, `filesize()` …

위와 같은 함수 안에 URL 스타일의 wrapper (e.g. `file://`, `php://`...)를 사용해 원하는 행위를 작동시킬 수 있음.

```php
<?php
	include "file:///etc/passwd";
?>
```

wrapper, extract, type juggling, session …
