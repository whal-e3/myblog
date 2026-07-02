// Notion export → Astro blog migration.
//
// Reads Posts CSV for metadata, converts each Notion .md to Astro blog post,
// copies referenced images into per-post folders under public/assets/.
//
// One-off. Run once, hand-check the output, then discard.

import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTION_DIR = resolve(__dirname, "..", "..", "notion-export");
const BLOG_DIR = resolve(__dirname, "..", "src", "content", "blog");
const ASSETS_DIR = resolve(__dirname, "..", "public", "assets", "content", "blog");

// Titles that need explicit English slug translations. Everything else is
// slugified from the title directly.
const SLUG_OVERRIDES = {
  "핵태온 2024 후기": "haektaeon-2024-recap",
};

// Manual patch for the one row missing topic+tags in the CSV.
const CSV_PATCHES = {
  "Secret message": { topic: "🎮Wargame", tags: "#dreamhack, reversing" },
};

// Topic emoji → tag word.
const TOPIC_TO_TAG = {
  "🎮Wargame": "wargame",
  "💻 Hacking": "hacking",
  "🚩CTF": "ctf",
  "💬 Personal Experience": "personal",
};

// ─── CSV parser ─────────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else { field += c; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ─── Slug generation ────────────────────────────────────────────────────────
function slugify(title) {
  if (SLUG_OVERRIDES[title]) return SLUG_OVERRIDES[title];
  return title
    .toLowerCase()
    .replace(/[/\\]/g, "-")     // I/O → i-o
    .replace(/[?!.,()[\]{}"']/g, "")  // strip punctuation
    .replace(/\s+/g, "-")       // spaces → dash
    .replace(/-+/g, "-")        // collapse dashes
    .replace(/^-|-$/g, "");     // trim leading/trailing dashes
}

// ─── Tag normalization ──────────────────────────────────────────────────────
function normalizeTags(tagsCsv, topic) {
  const raw = (tagsCsv || "").split(",").map((t) => t.trim()).filter(Boolean);
  const normalized = raw.map((t) =>
    t.replace(/^#/, "").toLowerCase().replace(/\s+/g, "-"),
  );
  const topicTag = TOPIC_TO_TAG[topic?.trim()];
  if (topicTag && !normalized.includes(topicTag)) normalized.unshift(topicTag);
  return normalized;
}

// ─── Date parser ────────────────────────────────────────────────────────────
function parseDate(str) {
  // "May 11, 2024 5:51 PM" → "2024-05-11"
  const d = new Date(str);
  if (isNaN(d.getTime())) return "2024-01-01";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Body cleanup ───────────────────────────────────────────────────────────
function cleanBody(rawBody, slug, imageMoves) {
  let body = rawBody;

  // Strip the metadata prelude (Overview/Created/Updated/Topic/Tags lines) —
  // these are duplicated in frontmatter.
  const metaKeys = [
    "Overview of Post",
    "Created Date",
    "Post Updated Date",
    "Topic",
    "Tags",
  ];
  for (const k of metaKeys) {
    body = body.replace(new RegExp(`^${k}:.*$`, "m"), "");
  }

  // Strip the <aside>...</aside> nav block (Home / Posts / About Me links).
  body = body.replace(/<aside>[\s\S]*?<\/aside>/g, "");

  // Notion sometimes buries markdown links inside an image's alt text —
  // sometimes multiple, sometimes at the start, sometimes in the middle.
  // Iteratively flatten any `[X](Y)` pattern that sits inside a `![...`
  // alt block, keeping only the link's inner text.
  let prev;
  do {
    prev = body;
    body = body.replace(
      /(!\[[^!\[]*?)\[([^\]]+)\]\([^)]+\)/g,
      "$1$2",
    );
  } while (body !== prev);

  // Rewrite image references: ![alt](encoded-path) → ![alt](/assets/content/blog/<slug>/clean-name)
  //
  // Filename mechanics on Notion export:
  //   - Disk file has one layer of percent-encoding (Korean "스크린샷" → "%EC%8A%A4...")
  //   - The .md path adds another (so it reads "%25EC%258A%258...")
  //   - So decode ONCE for the disk lookup, decode TWICE for a human-readable name.
  // Path may include balanced parens (e.g. Wikipedia filename "Buffer_(application)_logo.png"),
  // so allow one level of nested (...) inside the URL group.
  body = body.replace(/!\[([^\]]*)\]\(((?:[^()]|\([^)]*\))+)\)/g, (m, alt, path) => {
    if (path.startsWith("http")) return m; // external image, leave alone
    let srcName;
    try { srcName = decodeURIComponent(path); } catch { srcName = path; }
    let prettyName = srcName;
    try { prettyName = decodeURIComponent(srcName); } catch { /* ignore */ }
    // Transliterate the one common Korean prefix in this export.
    prettyName = prettyName.replace(/스크린샷/g, "screenshot");
    // URL-safe cleanup for the destination filename.
    const dstName = prettyName
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    imageMoves.push({ src: srcName, dst: dstName });
    return `![${alt}](/assets/content/blog/${slug}/${dstName})`;
  });

  // Collapse triple+ blank lines to double.
  body = body.replace(/\n{3,}/g, "\n\n");

  return body.trim();
}

// ─── Main ───────────────────────────────────────────────────────────────────
const csvPath = join(
  NOTION_DIR,
  "Posts ba4e49e1cd23432eb29b7c8ad67baddd_all.csv",
);
const csvText = await readFile(csvPath, "utf8");
const csvRows = parseCsv(csvText.replace(/^﻿/, ""));
const csvPosts = csvRows.slice(1); // drop header

// Build lookup: normalized title → Notion md file
const allFiles = await readdir(NOTION_DIR);
const mdFiles = allFiles.filter((f) => f.endsWith(".md"));

function findMdFile(title) {
  // Notion filename munges the title: / → space, ? and . stripped, then <hash>.md appended
  // We fuzzy-match by loading each md's first-line H1 and comparing.
  const target = title.trim();
  for (const f of mdFiles) {
    const hAndHash = f.replace(/\.md$/, "");
    // filename base (before the hash) — hash is 32 hex chars, preceded by space
    const base = hAndHash.replace(/ [0-9a-f]{32}$/, "").trim();
    // Loose comparison — Notion turns "/" into " " in the exported filename
    // and drops ?/!/. — normalize both sides the same way before compare.
    const norm = (s) =>
      s.replace(/\//g, " ").replace(/[?!\\]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (norm(base) === norm(target)) return f;
    // Also try matching without leading dot (`.deb ??` → `deb`)
    if (norm(base) === norm(target.replace(/^\./, ""))) return f;
  }
  return null;
}

const stats = { migrated: 0, skipped: [], missingMd: [] };

for (const row of csvPosts) {
  const [rawTitle, createdDate, overview, _updated, tagsCsv, topic] = row;
  const title = (rawTitle || "").trim();

  // Skip completely-empty rows.
  if (!title && !createdDate) continue;

  // Apply CSV patch (Secret message).
  const patch = CSV_PATCHES[title];
  const effectiveTags = patch?.tags ?? tagsCsv;
  const effectiveTopic = patch?.topic ?? topic;

  // Skip anything with no title at all (edge case).
  if (!title) { stats.skipped.push("(empty title)"); continue; }

  const mdFile = findMdFile(title);
  if (!mdFile) { stats.missingMd.push(title); continue; }

  const rawMd = await readFile(join(NOTION_DIR, mdFile), "utf8");
  // Drop the first `# title` line — frontmatter carries the title.
  const bodyWithoutHeader = rawMd.replace(/^#\s+.*\n/, "");

  const slug = slugify(title);
  const imageMoves = [];
  const cleanedBody = cleanBody(bodyWithoutHeader, slug, imageMoves);

  // Copy images into per-post asset folder.
  const postAssetsDir = join(ASSETS_DIR, slug);
  if (imageMoves.length) await mkdir(postAssetsDir, { recursive: true });
  for (const { src, dst } of imageMoves) {
    const srcPath = join(NOTION_DIR, src);
    if (!existsSync(srcPath)) {
      console.warn(`  ⚠ missing image "${src}" (referenced by "${title}")`);
      continue;
    }
    await copyFile(srcPath, join(postAssetsDir, dst));
  }

  // Build frontmatter.
  const tags = normalizeTags(effectiveTags, effectiveTopic);
  const description = (overview || "").trim();
  const date = parseDate(createdDate);

  // YAML-escape strings that contain quotes/colons/etc.
  const yamlStr = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  const frontmatter = [
    "---",
    `title: ${yamlStr(title)}`,
    `description: ${yamlStr(description)}`,
    `date: ${date}`,
    `draft: false`,
    `starred: false`,
    `tags: [${tags.map(yamlStr).join(", ")}]`,
    `comments: false`,
    "---",
    "",
    "",
  ].join("\n");

  await writeFile(join(BLOG_DIR, `${slug}.md`), frontmatter + cleanedBody + "\n");
  console.log(`  ✓ ${title.padEnd(30)} → ${slug}.md  (${imageMoves.length} images)`);
  stats.migrated++;
}

console.log(`\nDone. Migrated: ${stats.migrated}`);
if (stats.skipped.length) console.log(`Skipped: ${stats.skipped.length}`);
if (stats.missingMd.length) {
  console.log(`\n⚠ No matching Notion .md file for:`);
  for (const t of stats.missingMd) console.log(`   - ${t}`);
}
