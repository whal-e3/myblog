---
title: "Secure Mail"
description: ""
date: 2024-07-14
draft: false
starred: false
tags: ["hacking"]
comments: false
---

![Untitled](/assets/content/blog/secure-mail/Untitled_1.png)

### Browser dev-tool “Console tab”

Can use functions from the Source file. 

Because the Window (which contains the DOM that enables JS to access HTML) includes JS codes in `<script>` tag. 

And the Console allows you to interact with the Window object!

```html
<button type="submit" onclick="_0x9a220(pass.value);">Confirm</button>
```

Hence able to just use `_0x9a220()` function and brute force the correct value.

🚩
