# Jekyll on this repo — future-use notes

## Current state

- `.nojekyll` sits at the repo root → GitHub Pages serves **every file as-is**, with no Jekyll processing.
- Required because Next.js puts its chunks under `/blog/_next/*` and Jekyll skips any path starting with `_` unless told otherwise.

## When you'd need Jekyll

Pick Jekyll only if you want one of these:
- Liquid templates (`{% include header.html %}`, `{{ site.title }}`).
- Auto-renderable `.md` posts with front-matter under `_posts/`.
- Built-in collections (`_drafts/`, `_layouts/`, `_includes/`).
- Generated `_site/` build output served by GitHub.

If you just want static files (HTML/CSS/JS), keep `.nojekyll`.

## Recipe — turn Jekyll back on without breaking the blog

1. **Delete `.nojekyll`** at the repo root.
2. **Create `_config.yml`** at the repo root:

```yml
# Whitelist the Next.js chunks dir (otherwise Jekyll skips underscore-prefixed paths).
include:
  - blog/_next

# Tell Jekyll NOT to copy /blog/ into _site/ as Jekyll content. We want it served raw.
# `keep_files` ensures `_site/blog/` survives the next Jekyll build.
keep_files:
  - blog
  - ptimer
  - triplefind

# Skip Jekyll processing entirely on these dirs (they're already final output).
exclude:
  - blog
  - ptimer
  - triplefind
  - node_modules
  - vendor

# Your real Jekyll content lives in these (create when needed).
collections:
  pages:
    output: true
```

3. Now `/blog/`, `/ptimer/`, `/triplefind/` keep serving as-is.
   Anything OUTSIDE those dirs gets Jekyll processing.

4. To add a Jekyll page, create e.g. `notes/2026-05-18-private-thought.md` with front-matter:

```yml
---
layout: default
title: Private thought
sitemap: false   # exclude from search engines
robots: noindex,nofollow
---
Body text here.
```

## "Don't expose to outside" — three layers

GitHub Pages itself is **public** — no built-in auth. To keep content hidden:

### 1. Don't link to it
Easiest. Browsable only if URL guessed. Combine with `robots: noindex,nofollow` front-matter and a root `robots.txt`:

```txt
User-agent: *
Disallow: /notes/
Disallow: /private/
```

### 2. Long random path
e.g. `/notes-a8c3f9d2k/`. Unguessable. No auth still, just obscurity.

### 3. Real auth — switch hosting
GitHub Pages can't gate per-user. Move sensitive content to:
- **Cloudflare Pages** + Cloudflare Access (free for personal; SSO/email gate).
- **Vercel** with password-protected previews.
- A **private GitHub repo** with GitHub Codespaces / GitHub Pages Pro.
- Self-hosted on a server behind basic auth.

Recommended layer combo for private notes on this repo:
- `.nojekyll` stays (or `_config.yml` route above).
- Put draft content in `_drafts/` (Jekyll skips by default; serve via `--drafts` locally only).
- Add `robots.txt` blocking those paths.
- Don't add the link to `index.html`.

## Quick switch back to current state

```bash
git -C C:/Users/user/Documents/GitHub/invokfung.github.io rm _config.yml
git -C C:/Users/user/Documents/GitHub/invokfung.github.io commit -m "Disable Jekyll"
touch C:/Users/user/Documents/GitHub/invokfung.github.io/.nojekyll
git -C C:/Users/user/Documents/GitHub/invokfung.github.io add .nojekyll
git -C C:/Users/user/Documents/GitHub/invokfung.github.io commit -m "Restore .nojekyll"
git -C C:/Users/user/Documents/GitHub/invokfung.github.io push
```

## Useful Jekyll commands (local preview before push)

```bash
# in repo root, once
gem install bundler jekyll
bundle init
bundle add jekyll

# serve locally with drafts visible (won't deploy to GitHub)
bundle exec jekyll serve --drafts
# open http://localhost:4000/
```
