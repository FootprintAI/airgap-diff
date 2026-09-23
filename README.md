# Airgap Diff

A text diff tool that runs entirely in your browser. No server, no upload, no
account, no analytics — the page makes exactly one network request (to load
its own fonts), and the comparison itself never leaves the tab.

## Use it

Clone the repo and open `index.html` directly, or serve it with anything
static:

```sh
git clone https://github.com/FootprintAI/airgap-diff.git
cd airgap-diff
python3 -m http.server 8000   # or: npx serve
```

No build step. No `npm install` needed to *use* it — that's only for running
the test suite (see below). Once the page has loaded once, it works fully
offline: the diff library is vendored in `vendor/`, not loaded from a CDN.

## Features

- **Line, word, or character** diff granularity
- **Side-by-side or unified** view (line mode)
- Ignore whitespace / ignore case
- Hide unchanged lines, with click-to-expand on any collapsed run
- Open a file straight into either pane (read locally via `FileReader`,
  never uploaded)
- Copy the diff as plain text (`+`/`-` prefixed)
- Light and dark themes, following your system setting

## Why local

Diffing two files sometimes means diffing two files you'd rather not paste
into someone else's server — a config with real credentials in it, a
document with real names in it, two revisions of something under NDA. This
tool can't leak either side of that comparison, because it has no way to
send it anywhere.

## Development

```sh
node test.js              # sanity-checks the vendored diff library
npm install                # pulls in Playwright, dev-only
npx playwright install --with-deps chromium
npm run test:e2e           # exercises the actual UI in a real browser
```

`app.js` has no dependencies of its own — the only thing `npm install` is
for is running the end-to-end tests in `e2e/`.

**No GitHub Actions workflow yet.** A `ci.yml` (syntax check, the vendored-
library smoke test, and the Playwright suite above, on every push/PR) exists
but isn't committed — the pushing token doesn't carry the `workflow` OAuth
scope. Add `.github/workflows/ci.yml` running the three commands above
whenever that's convenient; until then, run them locally before pushing.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Includes a vendored copy of
[jsdiff](https://github.com/kpdecker/jsdiff) (BSD-3-Clause); see
[NOTICE](NOTICE) and `vendor/LICENSE-jsdiff.txt`.
