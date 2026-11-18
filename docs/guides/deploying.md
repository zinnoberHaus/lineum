# Deploying

A Lineum site is static files. Build it, then copy the folder anywhere.

```sh
lineum build --out site --base-url https://docs.example.com/
```

- `--base-url` adds canonical links, a sitemap and absolute URLs in `llms.txt`. Leave it out for private hosting.
- `--noindex` asks search engines to stay away (meta tag and `robots.txt`).
- `--no-sql` leaves SQL out of the site.
- Lineum only deletes an output folder it created itself (marked by a `.lineum-site` file), and it keeps `.vercel`, `.netlify`, `.git` and `CNAME` when it rebuilds.

## GitHub Pages

```yaml
name: Docs
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install dbt-core dbt-<your-adapter> "git+https://github.com/zinnoberHaus/lineum"
      - run: dbt deps && dbt docs generate   # needs warehouse credentials as secrets
      - run: lineum build --out site --base-url https://<you>.github.io/<repo>/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - uses: actions/deploy-pages@v4
```

Pin actions to commit SHAs in production workflows.

## Vercel, Netlify, Cloudflare Pages

Deploy the folder as a static site with no build step, for example `vercel deploy site --prod` or `netlify deploy --dir site --prod`. The demo at <https://lineum-demo.vercel.app> is deployed this way from `examples/larkspur`.

## S3, a web server, or no server

Upload the folder as is. Pages link to each other with relative paths, so the site works under any path prefix and also when opened from disk (`file://`). Serve `.js` as JavaScript and `.parquet` as binary; most servers do. Everything except the SQL page works offline.
