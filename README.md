# SunHyuk's blog

## Initial setup

```bash
git add . && git commit -m "initial commit"
git remote set-url origin REMOTE-URL
npx quartz sync --no-pull
```

## blog management structure

- blogging env: Obsidian
- Static-site generator: **Quartz 4**
- Hosting: Cloudflare
	- `git fetch --unshallow && npx quartz build`
	- `npx wrangler deploy --assets=./public --compatibility-date 2026-02-19`
- DNS: Cloudflare