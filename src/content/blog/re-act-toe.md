---
title: "re-act-toe"
description: ""
date: 2024-06-25
draft: false
starred: false
tags: ["ctf", "web-hacking"]
comments: false
---

Tic-Tac-Toe Website is provided.

![스크린샷 2024-06-25 114926.png](/assets/content/blog/re-act-toe/screenshot_2024-06-25_114926.png)

![스크린샷 2024-06-19 102631.png](/assets/content/blog/re-act-toe/screenshot_2024-06-19_102631.png)

Guessed there’s open dir which should not be opened and tried to brute force the dir name. ~~and failed miserably.~~

Also thought if it’s about react framework since the name of the problem was **re-act**-to. But no..

Searched for strings like “winner : ”, “Play Again”, “**O**” in devtools source code and found this snippet.

```jsx
 function ME({p: e, c: t}) {
    const n = sE(aE)
      , r = TE(s=>s.y)
      , o = p0(s=>s.items)
      , {x: l} = h0()
      , i = `${l}$d${o[5]}m be9${r}ns i${n.z} w${o[5]}nd3r`
      , u = `Th${r.y}s to0${o[8]} sh@l1 p${o[1]}s$`;
    return pe.jsxs(pe.Fragment, {
        children: [e === 786456 && pe.jsxs("h5", {
            children: [i, ":)"]
        }), t === 543845 && pe.jsxs("h5", {
            children: ["!", u]
        })]
    })
}
```

There’s leet speak. Guessing if I run the function, I’d get the complete sentence(flag).

`e === 786456` && `t === 543845`

![스크린샷 2024-06-25 115838.png](/assets/content/blog/re-act-toe/42a298e9-6afb-451b-af59-97c40f55d76d.png)

In order to stop at the `Me()` function, I used several bps.

![스크린샷 2024-06-25 115836.png](/assets/content/blog/re-act-toe/screenshot_2024-06-25_115836.png)

And Voila!

![스크린샷 2024-06-25 120445.png](/assets/content/blog/re-act-toe/screenshot_2024-06-25_120445.png)

🚩
