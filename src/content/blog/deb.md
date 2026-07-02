---
title: ".deb ??"
description: ""
date: 2024-06-17
draft: false
starred: false
tags: ["hacking", "linux"]
comments: false
---

![Untitled](/assets/content/blog/deb/Untitled_2.png)

Using Ubuntu Linux, I came across `.deb`  files quite often.

## Basics

`.deb` is Debian package.

`dpkg -i [package_name.deb]` installs the application.

## Structure

- Magic + Package Section : format version number.
- Control Sectionn `.tar.gz` : Package meta-info (e.g. dependencies…)
- Data Section `.tar.gz` : Actual installable files.

![Untitled](/assets/content/blog/deb/Untitled_3.png)

There was a dependency problem of installing `.deb` file, hence `apt` is developed! 

`apt` package manager uses `dpkg` to install Debain packages.
