---
title: "what was my password?"
description: ""
date: 2024-06-25
draft: false
starred: false
tags: ["ctf", "forensic"]
comments: false
---

`Password.ad1` file is provided.

You can look into the ad1 file using FTK Imager.

![Untitled](/assets/content/blog/what-was-my-password/Untitled_4.png)

And there’s file `my_password.zip` and a Regular File in `Notepad++` dir that says the above.

Now it’s about finding the Windows account security questions & answers.

After some search, I found that `C:\Windows\System32\config\SAM` file is the one I should look in to.

![Untitled](/assets/content/blog/what-was-my-password/Untitled_5.png)

To look in to the file, I need **AccessData Registry Viewer.**

![Untitled](/assets/content/blog/what-was-my-password/Untitled_6.png)

Found it! The security questions are…

- What was your first pet’s name? : lucy
- What’s the name of  the first school you attended? : sunset
- What was your childhood nickname? : princess

So **lucy_sunset_princess** is the password!

![Untitled](/assets/content/blog/what-was-my-password/Untitled_7.png)

![Untitled](/assets/content/blog/what-was-my-password/Untitled_8.png)

🚩
