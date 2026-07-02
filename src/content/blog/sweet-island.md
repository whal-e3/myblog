---
title: "Sweet Island"
description: ""
date: 2024-06-25
draft: false
starred: false
tags: ["ctf", "forensic"]
comments: false
---

> Find the item that ALEX can create using the item received from LIAM!
> 

`item.ad1` file is provided.

![스크린샷 2024-06-25 130020.png](/assets/content/blog/sweet-island/screenshot_2024-06-25_130020.png)

Found ingredients. Now I need to find what I can make with those…

![스크린샷 2024-06-25 132621.png](/assets/content/blog/sweet-island/screenshot_2024-06-25_132621.png)

> The Chrome Cache file format is used by Google Chrome and Chromium to store persistent cached data.
> 

![스크린샷 2024-06-25 135227.png](/assets/content/blog/sweet-island/screenshot_2024-06-25_135227.png)

Using *binwalk* is try-worthy. First export the `Cahce_Data` folder.

```bash
$ binwalk -e data_1
$ binwalk -e data_2
$ binwalk -e data_3
```

- `_data_1.extracted` ~ `_data_3.extraced` folder is created and each folder contains multiple files.

 

Now I can search for the “item” using the ingredients!

![스크린샷 2024-06-25 142145.png](/assets/content/blog/sweet-island/screenshot_2024-06-25_142145.png)

“Chocolate_churros” is the item!!🚩
