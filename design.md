# Design: KeePass `.kdbx` Password Manager SPA

> A single-page application that loads, edits, and saves KeePass `.kdbx` databases entirely in the browser.
> No backend server. The `.kdbx` file **is** the database. Runs from a USB stick on any PC or Android tablet.

---

## 1. Overview

### 1.1 Purpose
A portable, zero-install password manager that reads and writes KeePass `.kdbx` files directly in the browser.
The web app and a single `.kdbx` file live together on a USB stick, so the vault can be opened from **any**
machine or Android tablet with a browser — no account, server, or installation required. The master password
decrypts the file; nothing is ever stored server-side.

### 1.2 Scope
- **In scope:**
  - Open and load `.kdbx` file contents
  - Save `.kdbx` file contents back to disk (IndexedDB cache + download export)
  - Delete an entry (to the Recycle Bin, or permanent delete)
  - Restore entries from the Recycle Bin
  - Edit an entry (title, username, password, URL, notes, custom fields)
  - Group management: create / rename / delete groups, move entries between groups
  - Import entries from CSV (Chrome, Bitwarden, 1Password, LastPass, KeePass, etc.)
  - Password generation
  - Real-time search/filter of entries (persisted across navigation)
- **Out of scope:**
  - Browser extension
  - MFA enrollment
  - Multi-device / cloud sync

### 1.3 Goals / Non-Goals
| Goals | Non-Goals |
|-------|-----------|
| True portability — runs off a USB stick on any device | Multi-device sync |
| Fidelity to the `.kdbx` format (read/write round-trips) | Password strength auditing |
| Works offline, fully client-side | Server / hosting |

---

## 2. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | Vanilla JS (ESM) | No framework — minimal, portable |
| Routing | hash-based router (built-in) | No dependency |
| State | lightweight custom store (in-memory) | Holds the decrypted database while unlocked |
| `.kdbx` parsing & crypto | **kdbxweb** (Keeweb) | Decryption / encryption / format parsing in-browser |
| Crypto backend | kdbxweb (native + WASM) | AES-256 / Twofish, ChaCha20, Argon2id / PBKDF2 / Salsa20 KDF |
| File I/O | `<input type=file>` open; IndexedDB cache + download save | See §3.3 |
| Build | none — static folder | Vendored locally for offline use (see note below) |

> **Offline/USB note:** the app is opened via `file://` (double-click the HTML). Load `kdbxweb` with a
> non-module (global/UMD-style) build via a plain `<script>` tag — ES-module imports from `file://` are blocked
> by CORS. Keep the library vendored in the USB folder so the app works with no network access.

> **Reference implementation:** use **Keeweb** (keeweb.org) as a guide only — specifically its `kdbxweb`
> library — for the libraries and format details needed to talk to the `.kdbx` file. Do not copy UI wholesale.

---

## 3. Architecture (client-side, no backend)

### 3.1 High-level flow
```
Browser (this SPA)
   │  1. User opens .kdbx + enters master password
   ▼
kdbxweb: parse header → derive master key (KDF) → decrypt database
   │
   ▼
In-memory Database object (Groups + Entries)
   │  2. User edits entries / generates passwords
   ▼
kdbxweb: re-encrypt database with master key
   │
   ▼
  3.3 Save via IndexedDB cache + download export  →  .kdbx on disk / restored from cache
```

There is **no server, no database engine, no session**. The SPA is a renderer + editor for the encrypted file.

### 3.2 `.kdbx` file format overview
- `.kdbx` = KeePass XML eXchanged: a KeePass database container.
- The file = **header** (unencrypted metadata) + **encrypted binary database body**.
- The whole body is encrypted with a **master key** derived from the master password (+ optional key file).
- **KDF** (key derivation): Argon2id (default in KDBX 4.x), PBKDF2-SHA256, or Salsa20 — with a random header salt.
- **Cipher:** AES-256 or Twofish (KDBX 3.x), XChaCha20 (KDBX 4.x), with a composite HMAC for integrity.
- **KDBX version:** **4.x and 3.x both supported.** 4.x (XChaCha20) and 3.x (AES-256/Twofish) — read and write both. `kdbxweb` handles both formats.

### 3.3 File I/O strategy (critical cross-platform concern)
This is the biggest portability risk — browser support for direct file access varies widely.

| Approach | API | Supported |
|----------|-----|-----------|
| **Open** | `<input type="file">` | All browsers (Chrome/Edge/Opera/Firefox desktop, Safari/iOS, older Android, VS Code embedded browser) |
| **Save** | IndexedDB browser cache (`js/cache.js`) + `Blob` `<a download>` export | All browsers |

We deliberately **do not use the File System Access API** (`showOpenFilePicker`/`showSaveFilePicker`):
it is unavailable in Firefox, the VS Code embedded browser, and iOS Safari, and requires a secure context
(HTTPS/localhost) — none of which apply to a `file://` vault opened from a USB stick. This matches the
approach KeeWeb takes (local files with no cloud storage are saved to the browser cache and exported).

- **Open** via a native `<input type="file">` picker (`kdbx.openFile`). It resolves `{ buffer, name, handle }`
  where `handle` is always `null` (no FSA handle).
- **Save** (`save.saveDb`) does two things:
  1. writes the re-encrypted `.kdbx` bytes to the IndexedDB **browser cache** (`cache.save`) — durable across
     page reloads, so a reload can restore the last vault without re-picking the file (see `unlock.js`
     "Recently saved");
  2. exports a **Blob download** so the current state lands on disk.
- The decrypted db stays live in memory (`store.state.db`) for the session, so you never have to re-open
  after a save. `markDirty(false)` clears the dirty flag once saved to the cache.
- Always re-encrypt the database before caching/downloading; never persist decrypted data to the cache,
  disk, or browser storage.
- Cache writes are best-effort: if `cache.save` fails (e.g. quota), the download export still runs.

---

## 4. Data Model (KeePass structure)

A `.kdbx` database is a tree of **Groups** containing **Entries** (not relational rows).

### 4.1 Group / Entry tree
```
Database
└── Root Group          { UUID, Name, IconID, Times, IsHidden }
    └── Group           { UUID, Name, ... }   (nestable)
        └── Entry       { UUID, String fields, Timestamps, Protected flags }
        └── Entry       ...
```

### 4.2 Entry string fields
| Field | Ref | Notes |
|-------|-----|-------|
| Title | `T` | Human-friendly label |
| Username | `U` | Login username / email |
| Password | `P` | Stored value; mark as **protected** (`!` prefix) so it is hidden/censored in UI |
| URL | `W` | Optional site URL |
| Notes | `N` | Free text |
| AutoType | `A` | Optional auto-type associations |
| Custom fields | — | Arbitrary Name/Value pairs (extra notes / metadata) |
| Timestamps | — | Creation / Last-modification / Last-access / Expiration |

> In `.kdbx`, the password is stored as the literal value but the **entire file is encrypted** at rest by the
> master key — it is not separately hashed. Do not hash passwords; encrypt the whole database.

### 4.3 kdbxweb object model
- `kdbxweb.Kdbx.load(arrayBuffer)` → parses header + decrypts (needs the derived key).
- `db.rootGroup` → top-level `Group`.
- `group.children` → nested `Group` and `Entry` objects.
- `entry.strings` → keyed map of `{ T, U, P, W, N, ... }` plus custom fields.
- `kdbxweb.Kdbx.save(db)` → returns the encrypted `.kdbx` `ArrayBuffer` to write to disk.

---

## 5. Security Design

> **Critical section.** The master password is the sole key to all credentials. Document every control.

### 5.1 Master key derivation
- Master key = f(master password, optional key file, header salt).
- KDF: **Argon2id** (default), with PBKDF2-SHA256 / Salsa20 fallback for older files.
- The random salt lives in the file header; it is read on open — never hard-coded.
- Key files (optional) combine with the password; support opening files that use them.

### 5.2 Encryption at rest
- The whole database body is encrypted (AES-256/Twofish or XChaCha20 per KDBX version) and HMAC-verified.
- Mark sensitive fields (Password) as **protected** so they are masked in the UI and not copied by default.

### 5.3 In-memory handling & locking
- Database is decrypted **only in memory** while open.
- Clear sensitive string fields from memory on lock / tab close.
- Auto-lock after inactivity; re-enter master password to reopen.
- Do **not** store the master key, derived key, or decrypted vault in `localStorage` / `sessionStorage`.
- Optionally store only a non-sensitive preference (last-open file name) — never anything that unlocks the vault.

### 5.4 Browser hygiene
- CSP to mitigate XSS (even client-side, script injection could read an open vault). Deferred for `file://` runs, where a strict CSP meta tag would break local script loading; add a CSP (incl. `wasm-unsafe-eval` for argon2 WASM) when serving over HTTP.
- Clear clipboard automatically after copying a password/username.
- Treat copied credentials as time-sensitive; avoid leaving them in clipboard history.

### 5.5 Threat Model
| Threat | Mitigation |
|--------|-----------|
| Master password brute force | Argon2id KDF with tuned memory/cost (slows offline attacks) |
| Decrypted vault leaked via XSS | CSP, input sanitization, protected fields, clipboard clearing |
| Decrypted data persisted to disk/storage | In-memory only; no secrets in browser storage |
| Tampered .kdbx file | HMAC integrity verification on load |
| Opening untrusted .kdbx | Format is data only; no code execution from the file itself |

---

## 6. Frontend Architecture

### 6.1 Screens
| Screen | Description | Prerequisite |
|--------|-------------|--------------|
| Unlock | Open `.kdbx` + enter master password (optional key file) | None |
| Vault | Group/entry tree with search and password generation | Vault unlocked |
| Entry detail / editor | Edit title, username, password, URL, notes, custom fields | Vault unlocked |
| Settings | Placeholder stub (lock button only); full KDF/cipher info, auto-lock timeout, and about panels are not yet built | Vault unlocked |

> There is **no login/register** — authentication is the master password unlocking the local file.

### 6.2 Component Tree
```
App
├── UnlockScreen            (file picker + master password)
└── VaultLayout             (shown once unlocked)
    ├── GroupTree
    ├── EntryList
    ├── EntryEditor
    │   ├── StringField
    │   ├── PasswordField   (with generator + copy)
    │   └── CustomFields
    ├── PasswordGeneratorDialog
    └── SettingsPanel (stub — lock button only; full settings not yet built)
```

### 6.3 State management
- Hold the decrypted `Database` object in app state **only while unlocked**.
- Track lock state; on lock, drop the in-memory database and require re-unlock.
- Track "dirty" state to prompt before **locking or leaving** the session; the prompt lets the user keep editing or **discard unsaved changes and exit without saving**.
- Persist the active search filter (`store.state.searchQuery`) across navigation; clear it via the ✕ control in the search box.

---

## 7. Error Handling

| Scenario | Client behavior |
|----------|-----------------|
| Corrupt / unsupported `.kdbx` | Show clear "could not open file" with reason (bad version, bad key) |
| Wrong master password | Show generic unlock failure; do not reveal which is wrong |
| Unsupported file type | Reject non-`.kdbx` files at the picker |
| Save blocked (e.g. cache unavailable) | Still export a download; changes are lost on reload if neither saved |
| File modified externally | Not detected externally; the in-memory dirty flag prompts to discard on lock/leave |
| Very large database | Show progress while decrypting; avoid blocking UI |

---

## 8. Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| Portability | Runs from a folder on a USB stick — no install, no server |
| Browser support | Chrome/Edge/Opera/Firefox desktop (full); Safari/iOS + older Android (download/upload fallback) |
| Performance | Decrypt/open typical vault (< 1k entries) in a few seconds |
| Offline | Fully functional offline once loaded |
| Compatibility | Opens and saves both KDBX 3.x and 4.x (KeePass 2.x / Keeweb) |

---

## 9. Open Questions
- [ Build with current browser capabilites. Browsers more than a 2 years old can be dropped] Minimum target browsers/OS (drives how much fallback UX we must build)?
- [Yes ] Support **key files** in addition to master password?
- [4.x and 3.x ] KDBX 4.x and 3.x both supported.
- [Auto-lock ~10 min; USB removed → treat as lock] Auto-lock timeout default and USB-removed behavior (recommended — confirm). The cache-and-export save strategy is captured in §3.3.
- [Length 16; upper + lower + digits; exclude ambiguous chars] Password generator defaults (length, character sets, exclusions)? (recommended — confirm)

---

## 10. Milestones / Phases
1. **M1** — `.kdbx` load + unlock: open file, derive key, decrypt, render group/entry tree (kdbxweb wired up).
2. **M2** — Save: `<input type=file>` open + IndexedDB cache and download-export round-trip (KeeWeb model).
3. **M3** — CRUD: create / edit / delete entries and custom fields.
4. **M4** — Password generation + protected-field masking + clipboard clearing.
5. **M5** — Locking/inactivity, error handling, cross-browser polish, USB portability testing.
