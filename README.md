# dsh-inbox

[中文](README.zh.md) | English

A personal **information hub / unified inbox** plugin for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH). It aggregates your personal mailboxes — **Gmail** and **QQ Mail** — into one panel: one list, one unread counter, channel/account filters, search, and a message preview pane.

> Scope of this MVP: **email only, read-only**. IM (QQ / WeChat / Douyin) aggregation is intentionally out of scope for now — those platforms have no official personal messaging API and require risky unofficial hooks. See [Roadmap](#roadmap).

## Features

- 📥 Unified inbox across Gmail + QQ Mail accounts
- 🔔 Unread counter per channel and overall
- 🔎 Filter by channel / account, search sender & subject, "unread only" toggle
- 📄 On-demand message body preview (plain text preferred; sanitized HTML fallback)
- 📎 Attachment name/size listing
- ⚙️ Account manager: add / edit / delete, per-account IMAP host+port, test connection
- 🔐 Credentials encrypted at rest (AES-256-GCM, key under `DSH_HOME`)
- ⏱ Background IMAP sync every 3 minutes + manual "Sync"

## Install

```powershell
pwsh -File .\install.ps1
```

The script copies the plugin into `%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-inbox`, records a `file:` dependency and appends a loader row to the profile's `cordis.patch.yml` (backups kept). Then refresh the DSH Web GUI.

To uninstall, delete the `dsh-inbox` row from `cordis.patch.yml` and the `node_modules\dsh-inbox` folder.

## Configure a mailbox

Open **信息中心 → 账号设置** (Accounts) and add an account.

| Channel | IMAP host:port | Password field |
|---|---|---|
| Gmail | `imap.gmail.com:993` | Google **App Password** (requires 2-Step Verification) |
| QQ Mail | `imap.qq.com:993` | 16-digit **auth code** (Settings → Account & Security → enable IMAP, verify by SMS) |

Never paste your primary account password. Use an app-specific password / auth code, and revoke it from the provider when done.

## Data & security

All data lives under `%DSH_HOME%\dsh-inbox\` (default `~/.dsh/dsh-inbox`):

- `accounts.json` — account metadata (no secrets)
- `secrets.json` — AES-256-GCM encrypted passwords
- `messages.json` — message summaries (subjects/from/date; no full bodies)
- `cursors.json` — per-account sync cursors
- `secret.key` — 32-byte AES key (created on first use, best-effort `0600`)
- `backups/` — latest 20 timestamped snapshots per file

Full message bodies are fetched on demand and cached in memory only. Nothing is sent anywhere except your own IMAP servers.

## How it works

- **Host half** (`lib/index.js` + `lib/mail.js` + `lib/store.js`): IMAP sync loop using [`imapflow`](https://github.com/postalsys/imapflow) and [`mailparser`](https://github.com/nodemailer/mailparser); exposes `POST /api/dsh-inbox/state`.
- **Browser half** (`lib/client.js`): registers a `main` panel and a `sidebar.panellist` entry; talks to the host route.
- **Zero runtime dependencies**: `imapflow` and `mailparser` are pre-bundled by esbuild into a single `lib/vendor.cjs`, so no `node_modules` is needed at install time (after changing deps, run `npm install && npm run build:vendor`).

> After a first install or a host-code update, if behaviour does not look like the latest version, restart DSH once so the host half reloads (saved data is unaffected). Refreshing the page reloads the browser half.

## Roadmap

- P1: QQ messages via a user-provided NapCat / OneBot endpoint (unofficial, opt-in)
- P2: WeChat / Douyin (unofficial hook or RPA, off by default, with risk disclaimer)

## License

MIT
