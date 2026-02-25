# Running 1Code with WSL

1Code supports a split architecture where the React UI runs natively on Windows while all backend operations (Claude SDK, terminal, file system, git, database) execute inside WSL.

## Prerequisites

- **Windows 10/11** with WSL 2 installed (`wsl --install`)
- A WSL distribution (e.g., Ubuntu) with **Node.js 20+**
- **bun** installed in WSL (`curl -fsSL https://bun.sh/install | bash`)
- The repo cloned somewhere accessible from both Windows and WSL

### Installing Node.js in WSL

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # v20.x or higher
```

---

## Development Workflow (from source)

There are two processes to run — one on each side:

```
 WINDOWS (PowerShell)              WSL (bash)
 ────────────────────              ──────────
 bun run dev                       node resources/wsl-server/index.js
 → Electron app + React UI         → tRPC backend server
 → connects to WSL server           → Claude, terminal, files, git, DB
```

### Step 1: Build the server bundle (WSL)

```bash
# In WSL, from the repo root
bun install --ignore-scripts   # skip electron-rebuild (not needed in WSL)
bun run server:build           # → resources/wsl-server/index.js
```

### Step 2: Install server dependencies (WSL)

The bundle externalizes native modules. Install them once:

```bash
cd resources/wsl-server
npm init -y
npm install better-sqlite3 node-pty ws
cd ../..
```

### Step 3: Start the WSL server

```bash
# In WSL, from the repo root
# The server needs an auth token — for dev, pass it directly:
ANTHROPIC_AUTH_TOKEN=<your-api-key> node resources/wsl-server/index.js
```

You should see:
```
[1code-server] Starting WSL backend server...
[1code-server] Control channel listening on ws://localhost:19101
[1code-server] tRPC WebSocket listening on ws://localhost:19100
[1code-server] Ready.
```

> **Note:** Without `ANTHROPIC_AUTH_TOKEN`, the server waits 60s for the
> Electron shell to send a token via the control channel, then exits.
> For standalone dev, always pass the token as an env var.

### Step 4: Start the Electron app (Windows)

```powershell
# In PowerShell, from the repo root (Windows path)
bun run dev
```

### Step 5: Tell the renderer to use WebSocket

The renderer needs to know to connect to the WSL server instead of using Electron IPC. Open the browser console in the Electron window (Ctrl+Shift+I) and run:

```js
localStorage.setItem("1code-wsl-mode", "true")
location.reload()
```

The UI is now talking to the WSL backend. All terminal sessions, file operations, and Claude calls execute inside WSL.

To switch back to normal Electron mode:
```js
localStorage.removeItem("1code-wsl-mode")
location.reload()
```

---

## Production Workflow (packaged app)

For end users with a packaged 1Code install:

1. Open 1Code on Windows
2. Go to **Settings > WSL** (Advanced section)
3. Select your WSL distro from the dropdown
4. Toggle **Enable WSL Mode** on — this auto-installs the server bundle in WSL
5. Restart 1Code

On restart, Electron spawns the WSL server automatically and manages its lifecycle (start, stop, crash recovery, auth token delivery).

---

## How It Works

```
Windows (Electron)                    WSL (Node.js server)
┌──────────────────────┐             ┌──────────────────────┐
│  Electron Shell      │             │  1Code Backend       │
│  ┌────────────────┐  │  WebSocket  │                      │
│  │ React UI       │  │  :19100     │  tRPC routers        │
│  │ (trpc wsLink)  │◄─┼────────────┤  Claude SDK           │
│  └────────────────┘  │             │  Terminal (node-pty)  │
│                      │  Control    │  File operations      │
│  Window management   │  :19101     │  Git operations       │
│  Clipboard / Shell   │◄───────────┤  SQLite database      │
│  Auth / safeStorage  │             │                      │
│  Auto-updater        │             └──────────────────────┘
└──────────────────────┘
```

**Port 19100** — tRPC WebSocket: all application RPCs (chat, terminal, files, git, etc.)

**Port 19101** — Control channel: reverse proxy for operations that must happen on Windows (file dialogs, clipboard, safeStorage, auth tokens)

### What runs where

| Windows (Electron) | WSL (Node.js) |
|---|---|
| React renderer | All tRPC routers |
| Window controls | Claude SDK / binary |
| Clipboard read/write | Terminal PTY (bash/zsh) |
| File open/save dialogs | File system operations |
| OAuth / auth flow | Git operations |
| Auto-updater | SQLite database |
| Notifications | Codex ACP |

### Data locations (inside WSL)

In production (auto-installed by Settings UI):

| Data | Path |
|---|---|
| Server bundle | `~/.local/share/1code/server/index.js` |
| Claude binary | `~/.local/share/1code/bin/claude` |
| SQLite database | `~/.local/share/1code/data/agents.db` |
| Server node_modules | `~/.local/share/1code/server/node_modules/` |

In development, the server runs directly from `resources/wsl-server/` in the repo.

### Auth token flow

In production:
1. Electron decrypts the OAuth token via Windows DPAPI (safeStorage)
2. Sends it to the WSL server over the control channel (port 19101)
3. Server stores it in memory for Claude SDK calls

In development: pass `ANTHROPIC_AUTH_TOKEN` as an environment variable.

---

## Rebuilding After Code Changes

```bash
# In WSL — rebuild the server bundle after changing backend code
bun run server:build

# Restart the server (Ctrl+C then re-run)
ANTHROPIC_AUTH_TOKEN=<key> node resources/wsl-server/index.js
```

The Electron dev server (`bun run dev`) hot-reloads UI changes automatically. Backend changes require rebuilding and restarting the WSL server.

---

## Limitations

- **MCP servers** must be Linux executables installed inside WSL. Windows-native MCP servers won't work.
- **File dialogs** open on the Windows side. Paths are translated to `/mnt/` paths.
- **Ports 19100-19101** must be free. Override with `ONECODE_SERVER_PORT=<port>`.

## Troubleshooting

### "WSL is not available on this system"
Run `wsl --install` in an elevated PowerShell, then reboot.

### "Node.js is not installed"
See Prerequisites above.

### Server fails to start
```bash
wsl -d Ubuntu -- echo ok          # is the distro running?
wsl -d Ubuntu -- node --version   # is Node available?
```

### "Timed out waiting for auth token"
You're running the server without `ANTHROPIC_AUTH_TOKEN` and without the Electron shell connected. Either pass the token as an env var (dev mode) or start the Electron app with WSL mode enabled (production mode).

### Database errors
Ensure `~/.local/share/1code/data/` exists. Don't place the DB on a Windows mount (`/mnt/c/...`) — 9p filesystem locking is unreliable for SQLite.

### "Cannot find module better-sqlite3" or similar
Run `npm install better-sqlite3 node-pty ws` in the directory containing `index.js` (either `resources/wsl-server/` for dev or `~/.local/share/1code/server/` for production).
