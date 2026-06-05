# The Local Intelligence Project

> Let's reclaim intelligence.

A static website for The Local Intelligence Project: a community infrastructure
project for local AI literacy, reclaimed hardware, offline networks, Digital
Terraforming, and practical independence from centralized AI systems.

## Run it

It is plain static HTML/CSS/JS. For local editing with disk-backed saved text
edits, use the included editor server:

```bash
cd ~/projects/local-intelligence
python3 editor-server.py
# -> http://127.0.0.1:8000
```

The public site hides the local editing toolbar automatically outside
`localhost` / `127.0.0.1`.

## Deploy

The site can be deployed as static files on GitHub Pages, Vercel, Netlify, or
any standard static host. No build step is required.
