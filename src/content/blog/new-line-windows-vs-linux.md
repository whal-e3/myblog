---
title: "new line, Windows vs Linux"
description: ""
date: 2024-07-17
draft: false
starred: false
tags: ["hacking"]
comments: false
---

![Photo by Gabriel Heinzer on Unsplash](/assets/content/blog/new-line-windows-vs-linux/Untitled.jpeg)

Photo by Gabriel Heinzer on Unsplash

# New line

Windows : `\r\n`

Linux : `\n`

In vim(neovim), `\r` is visualized with `^M` .

The miss match can be easily fixed with `:%s/\r//g` command.

for more…

Why Windows uses \r\n newlines instead of \n
