# Repfolio

Your JEFIT training history as a private dashboard. It uses plain static files and has no framework, no build step and no server. GitHub does the back-end work.

## How it works, back to front

### 1. Sync and storage: GitHub Actions and an encrypted file

- **`.github/workflows/sync.yml`** runs every 6 hours, or on demand from the Actions tab. It runs `tools/sync-jefit.js` on Node 20.
- **What the sync reads:** the **JEFIT Open Training API**, using your read-only token from the `JEFIT_TOKEN` secret. It fetches two years of sessions with their logs, your current routine, and the exercise names.
- **Encryption:** the sync encrypts the snapshot with WebCrypto. Your `VAULT_PASSPHRASE` secret goes through PBKDF2-SHA256 (600,000 rounds) to make an AES-256-GCM key.
- **Storage:** the ciphertext is force-pushed as a single commit to the orphan branch **`jefit-data`** (`data.enc.json`). GitHub only ever holds ciphertext.
- **Skipped writes:** if nothing changed, nothing is written. The salt is reused between syncs, so devices you've already unlocked stay unlocked.
- **Why the browser never calls JEFIT:** in a public static site the token would be visible to anyone, and JEFIT most likely blocks requests from other websites anyway.

### 2. Reading the data: `js/vault.js`

- The site reads `data.enc.json` through the GitHub Contents API **without a token**. The repo is public and the file is ciphertext, so no token is needed.
- **On each device:**
  - An encrypted copy of the vault is kept in `localStorage`.
  - The unlock key is kept in IndexedDB. It's a non-extractable `CryptoKey`, so it can't be copied out, and you aren't asked for the passphrase on every visit.
  - **Lock** forgets the key.
  - Safari and a home-screen app each keep their own copy, so each needs the passphrase once.
- **Offline-first:** cached data shows instantly. The site then checks GitHub for a newer sync, and keeps the cached copy if it's offline.
- **New passphrase:** if you change `VAULT_PASSPHRASE`, each device asks for the new one.

### 3. Hosting

- **GitHub Pages** serves the repo root as is.
- **`.github/workflows/pages.yml`** runs on every push to `main`. It installs Node 20, runs the validators and tests, then deploys. **If a test fails, nothing deploys.**
- **Add to Home Screen:** `manifest.json` and the icons in `icons/` give the app its icon. There's no service worker.

### 4. Logic (`js/`): no libraries, no `package.json`

Each file attaches itself to `window.*` and also exports through `module.exports`. That lets the same code run in the browser, in the sync job and under the Node tests.

| File | Role |
| --- | --- |
| `crypto.js` | PBKDF2 to AES-GCM key. `seal` / `open` the vault envelope, with the header bound as AAD so it can't be altered |
| `vault.js` | GitHub fetch, localStorage cache, IndexedDB key, refresh, lock |
| `snapshot.js` | Turns raw JEFIT responses into the compact snapshot and resolves JEFIT's three exercise-id shapes |
| `metrics.js` | Volume (working sets), Epley e1RM, progress figures by record type |
| `format.js` | Units (JEFIT stores pounds; kg is display-only), dates, durations |
| `charts.js` | Hand-written SVG bar and line charts |
| `ui.js` | Escaped HTML templating: every value is escaped unless explicitly marked safe |
| `sample.js` | Deterministic sample data in JEFIT's exact response shapes |
| `app.js` | Hash routes `#/`, `#/sessions`, `#/session/<id>`, `#/exercise/<id>`, `#/routine` |
| `config.js` | Which repo and branch to read; display unit and time zone |

### 5. Tests (`tools/`)

Node scripts with no test framework. Run them all with:

```bash
node tools/run-tests.js
```

- They cover crypto, the vault, the sync, snapshots, metrics, formatting, escaping, and site validators. The validators check that referenced files exist, the script order, the manifest, the CSP rules, and that no secrets are committed.
- **`fake-jefit.js`** is an in-memory JEFIT API. **`fake-github.js`** is an in-memory GitHub. Sync and encryption are tested without touching either real service.

## Setup

1. **JEFIT token:** create a **Read-only** token at <https://www.jefit.com/my-jefit/settings/api-tokens>. The JEFIT API requires an active **Elite** subscription for every call.
2. **Repository secrets:** go to *Settings → Secrets and variables → Actions → New repository secret* and add:
   - `JEFIT_TOKEN`: the token from step 1.
   - `VAULT_PASSPHRASE`: a passphrase of 12 or more characters. You'll type it once on each device. **If you lose it, nothing can be recovered**; set a new one and the next sync re-encrypts everything.
3. **Pages:** go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**.
4. **First sync:** go to *Actions → Sync JEFIT → Run workflow*. This creates the `jefit-data` branch.
5. **Open the site** at `https://<owner>.github.io/<repo>/`. If you forked or renamed the repo, update `js/config.js` first.

### Run it locally

No install is needed:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> and choose **try it with sample data**.

To produce a real vault file locally:

```bash
JEFIT_TOKEN=jfit_pat_... VAULT_PASSPHRASE='...' node tools/sync-jefit.js /tmp/data.enc.json
```

Never commit the output to `main`; it belongs on the `jefit-data` branch, and a test enforces this.

## Security notes

- The JEFIT token exists only as an Actions secret. It never appears in the site, the repo or the logs; the sync logs counts only.
- Anyone can download the ciphertext. Its safety rests entirely on your passphrase, so make it long.
- The page sets a strict Content Security Policy: no inline scripts, and it connects only to `api.github.com`.
- If a token leaks, revoke it on the JEFIT access tokens page.

JEFIT's API is in beta and may change. This project is not affiliated with JEFIT.
