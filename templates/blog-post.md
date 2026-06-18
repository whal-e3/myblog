<!--
  ─── WHERE TO SAVE THIS FILE ──────────────────────────────────────────────

  Save as:        src/content/blog/<slug>.md
  Slug rules:     kebab-case, lowercase, no spaces, no special chars
                  e.g. "openvsa-rf-chain.md", "my-first-post.md"
  Resulting URL:  https://sunhyuk.dev/blog/<slug>

  If the post has images/videos, put them at:
                  public/assets/content/blog/<slug>/*
  and reference them as:
                  /assets/content/blog/<slug>/screenshot.png

  Quick start (PowerShell or bash):
      cp templates/blog-post.md src/content/blog/<slug>.md
      # then edit frontmatter + body

  Delete this comment block before publishing.
-->

---
# ─── REQUIRED ────────────────────────────────────────────────────────────────
title: "Post title here"
description: "One-line summary shown on cards, sidebar, and social previews."
date: 2026-06-05

# ─── OPTIONAL — defaults shown ──────────────────────────────────────────────
# draft: true  hides the post EVERYWHERE (home, blog index, tags, sidebar).
draft: false

# starred: true  shows the post in the homepage "Starred" section.
starred: false

# tags: creates /tags/<tag> pages automatically. Lowercase, no spaces.
tags: []

# publishDate: future date hides the post until that day (scheduled publish).
# publishDate: 2026-12-25

# cover: path to a hero image shown above the post (and on cards).
# cover: /assets/content/blog/<slug>/cover.png

# comments: Giscus comments — defaults to true.
comments: true
---

Intro paragraph. Decide the hook in the first 1–2 sentences — the homepage and blog index show only `description`, but the body's first sentence carries the post once a reader clicks in.

## Section heading

Use `##` for top-level sections. `#` is reserved for the post title (which Astro renders from frontmatter). Don't add an `# H1` in the body.

### Subsection

Lists, links, emphasis all work:

- Bullet item
- Another item, with a [link to somewhere](https://example.com)
- **Bold** and *italic* and `inline code`

Numbered when order matters:

1. First step
2. Second step

### Code blocks

Triple-backtick with a language tag enables Shiki syntax highlighting
(github-dark theme, configured in astro.config.mjs):

```python
def hello(name: str) -> None:
    print(f"hi, {name}")
```

```bash
npm run build
```

### Math (KaTeX)

Inline math with single dollars: $E = mc^2$, or $\sigma = \sqrt{\frac{1}{N}\sum (x_i - \mu)^2}$.

Display math with double dollars on their own paragraph:

$$
\text{FSPL (dB)} = 20\log_{10}(d) + 20\log_{10}(f) + 20\log_{10}\!\left(\frac{4\pi}{c}\right)
$$

### Tables

| Column A | Column B | Column C |
|---|---|---|
| Left-aligned | by default | works fine |
| For alignment | use colons | in the separator |

### Images

Store images in `public/assets/content/blog/<post-slug>/` so they ship with
the site, then reference with the absolute URL:

![Alt text describing the image](/assets/content/blog/<post-slug>/screenshot.png)

For a hero/cover image, set `cover:` in the frontmatter instead of embedding
it in the body — that way it shows on cards too.

### Blockquotes / callouts

> Quoted text or callout. Useful for "tldr:" or notes.

### Horizontal rule

---

### Inline HTML (when Markdown isn't enough)

Astro's markdown supports HTML for things like video embeds:

<video controls width="100%" preload="metadata">
  <source src="/assets/content/blog/<post-slug>/demo.mp4" type="video/mp4" />
</video>

---

## Footnotes / links section (optional)

If the post is reference-heavy, gather links at the bottom for readability:

- GitHub: [repo](https://github.com/whal-e3/...)
- Paper: [arxiv](https://arxiv.org/abs/...)
- Related post: [/blog/<slug>](/blog/<slug>)
