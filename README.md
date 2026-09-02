# 🔐 WebPass — Portable Client-Side KeePass Password Manager

**WebPass** is a modern, lightweight, serverless single-page application (SPA) designed to read, edit, manage, and create KeePass `.kdbx` password vaults entirely within your browser. 

It requires **no installation, no cloud backend, no account registration, and no network connection**. You can run WebPass directly off a USB flash drive via `file://` or host it on any static web server.

---

## ✨ Key Features

### 📁 Vault & Group Management
- **Create New `.kdbx` Vaults**: First-time users without an existing KeePass file can generate a fresh KDBX v4 vault right from the startup screen.
- **Full `.kdbx` Format Support**: Read and write both **KDBX 4.x** (Argon2id, XChaCha20) and **KDBX 3.x** (AES-256, Twofish, PBKDF2) formats.
- **Vertical Group Tree**: Organize entries in nestable folders with collapsible/expandable parent nodes.
- **Top-Level Unpacking**: Clean sidebar hierarchy displaying top-level groups directly under **📁 All Entries**.
- **`+ Group` Creation Modal**: Create new groups anywhere in the database hierarchy with automatic folder expansion and selection.
- **Move Entries Between Groups**: Easily reassign entries to any group in your database directly from the entry editor.

### 🗑️ Recycle Bin & Entry Restoration
- **Pinned Top-Level Recycle Bin**: Pinned at the very top of the group sidebar for quick access. Duplicate nested recycle nodes in folder subtrees are automatically filtered out.
- **Origin Group Badges**: Recycled items display origin badges (e.g. `🗑️ Recycle Bin (Shopping)`) so you know exactly where an entry was deleted from.
- **Restore & Permanent Delete**: Restore deleted entries back to their original parent group or permanently purge them.

### ⚡ Entry Editing & Credentials
- **Complete Entry Editor**: Modify Title, Username, Password, URL, Notes, and arbitrary Custom Fields.
- **Instant Search**: Real-time filtering across titles, usernames, URLs, and notes.
- **Origin Group Pills**: Entries rendered in search results or "All Entries" view show styled `📁 GroupName` pills next to their titles.
- **One-Click Quick Copy**: Instant copy buttons for usernames, passwords, and URLs.
- **Built-in Password Generator**: Custom dialog to generate cryptographically secure passwords with configurable length, character sets (uppercase, lowercase, digits, symbols), and ambiguous character filtering.

### 🔒 Security & Persistence
- **100% Client-Side Cryptography**: Powered by `kdbxweb` with WebAssembly/native Argon2id and Web Crypto API. Decryption occurs strictly in-memory.
- **IndexedDB Session Cache**: Re-encrypted vaults persist in the browser's IndexedDB cache so page reloads do not require re-opening the file from disk.
- **Automatic Export Downloads**: Saving updates the local session cache and exports a fresh `.kdbx` file download to your device.
- **Inactivity Auto-Lock**: Automatically locks the vault after 10 minutes of inactivity or manual lock button click.

---

## 🛠️ Architecture & Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS (ES Modules) + CSS3 | Zero framework overhead, ultra-fast performance, zero external dependencies |
| **Styling** | Custom Modern CSS | Dark mode UI with glassmorphism, responsive flex layouts, and custom modal overlays |
| **Crypto & Format Parsing** | `kdbxweb` (Keeweb) | Decrypts, parses, and encrypts `.kdbx` container files in-browser |
| **KDF & Ciphers** | Argon2id, AES-256, XChaCha20 | Cryptographically secure key derivation and symmetric encryption |
| **Storage Model** | IndexedDB Cache + Blob Download | Browser-compatible file persistence matching KeeWeb's local storage model |

---

## 📂 Project Directory Structure

```
web-pass/
├── index.html              # Main HTML entry point & shell layout
├── css/
│   └── style.css           # Complete design system & custom component styling
├── js/
│   ├── app.js              # Application bootstrapper & global initialization
│   ├── kdbx.js             # KDBX data-layer wrapper (CRUD, groups, search, entries)
│   ├── store.js            # In-memory reactive state manager (db, selection, locks)
│   ├── router.js           # Lightweight hash-based router (#/unlock, #/vault)
│   ├── save.js             # Re-encryption, IndexedDB caching, & Blob download triggers
│   ├── cache.js            # IndexedDB key-value store for offline persistence
│   ├── lock.js             # Inactivity timer & lock event handlers
│   ├── password.js         # Cryptographic password generator engine
│   ├── ui.html             # DOM helper utilities (ui.el, ui.clear, toast alerts)
│   ├── argon2-setup.js     # Argon2 WebAssembly loader & fallback configuration
│   ├── components/
│   │   ├── unlock.js       # Unlock screen & New Database creation modal/flow
│   │   └── vault.js        # Main vault UI (sidebar tree, entry cards, editor, modals)
│   └── lib/
│       ├── kdbxweb.min.js  # Vendored kdbxweb library for offline execution
│       └── argon2-bundled.min.js # Vendored Argon2 WASM bundle
└── design.md               # Original architectural design specification
```

---

## 🚀 Getting Started

### Option 1: Run directly from a USB Stick (No Server)
1. Double-click `index.html` to open WebPass in any web browser.
2. Click **`✨ Create new .kdbx database`** if you are a first-time user, or **`📂 Open existing .kdbx file`** to load an existing vault.

### Option 2: Host on a Local or Remote Web Server
Serve the repository directory using any web server:
```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js npx serve
npx serve .
```
Navigate to `http://localhost:8080` in your web browser.

---

## 📖 How to Use

### 1. Creating a New Vault (First-Time Users)
1. On the startup screen, click **`✨ Create new .kdbx database`**.
2. Enter your desired **Vault Filename** (e.g. `Passwords.kdbx`).
3. Enter and confirm your **Master Password**.
4. Click **Create & Open Vault**.
5. Your new `.kdbx` file will be generated, saved to your browser cache, downloaded to your computer, and opened immediately!

### 2. Opening an Existing Vault
1. Click **`📂 Open existing .kdbx file`** and select your `.kdbx` file.
2. If using a Key File, check **Use a key file** and choose your `.key` file.
3. Enter your **Master Password** and click **Unlock**.

### 3. Managing Groups & Moving Entries
- **Create a Group**: Click the **`+ Group`** button in the sidebar header. Enter a group name, select the Parent Group (or **`📁 Top Level`**), and click **Create Group**.
- **Move an Entry**: Select an entry, click **Edit**, choose a new group from the **Group** dropdown, and click **Save**.

### 4. Managing Recycled Items
- Click **`🗑️ Recycle Bin`** at the top of the sidebar.
- Deleted entries show an origin badge (e.g., `🗑️ Recycle Bin (Shopping)`).
- Click **Restore** to return the entry to its original group, or **Delete Permanently** to purge it forever.

### 5. Saving Changes
- Click **Save Vault** in the top navigation header (or press <kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Cmd</kbd>+<kbd>S</kbd>).
- WebPass re-encrypts the vault, updates your browser cache, and exports the updated `.kdbx` file to your downloads folder.

---

## 🛡️ Security Philosophy

- **Zero Server Overhead**: Secrets never leave your browser context. All encryption and key derivations run client-side.
- **Memory Hygiene**: Upon locking, all decrypted in-memory database structures and keys are wiped from JavaScript memory.
- **No Remote Telemetry**: Zero tracking scripts, analytics, or third-party external network requests.
