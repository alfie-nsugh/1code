# Running 1Code with WSL

1Code supports a split architecture where the React UI runs natively on Windows while all backend operations (Claude SDK, terminal, file system, git, database) execute inside WSL. This gives you native Linux toolchain access without leaving the Windows desktop.

## Prerequisites

- **Windows 10/11** with WSL 2 installed (`wsl --install`)
- A WSL distribution (e.g., Ubuntu) with **Node.js 20+** installed
- 1Code built from the `feat/wsl-split-architecture` branch

### Installing Node.js in WSL

```bash
# Inside your WSL distro
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # should print v20.x or higher
```

## Quick Start

1. **Open 1Code** on Windows normally.
2. Go to **Settings > WSL** (in the Advanced section).
3. Select your WSL distribution from the dropdown.
4. Toggle **Enable WSL Mode** on.
5. **Restart 1Code** when prompted.

On restart, 1Code will:
- Launch a Node.js backend server inside your WSL distro
- Connect the UI to the WSL server over WebSocket (`ws://localhost:19100`)
- Route all Claude, terminal, file, and git operations through WSL

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

**Port 19100** — tRPC WebSocket: all application RPCs (chat, terminal data, file reads, git status, etc.)

**Port 19101** — Control channel: reverse proxy for operations that must happen on Windows (file dialogs, clipboard, safeStorage encryption, auth tokens)

## Architecture Details

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

| Data | Path |
|---|---|
| Server bundle | `~/.local/share/1code/server/index.js` |
| Claude binary | `~/.local/share/1code/bin/claude` |
| SQLite database | `~/.local/share/1code/data/agents.db` |
| Server node_modules | `~/.local/share/1code/server/node_modules/` |

### Auth token flow

OAuth tokens are stored encrypted on Windows via Electron's `safeStorage`. On startup:

1. Electron decrypts the token using Windows DPAPI
2. Sends it to the WSL server over the control channel (port 19101)
3. The server stores it in memory for Claude SDK calls
4. If the token expires, the server requests a refresh via the control channel

## Building the WSL Server Bundle

If developing from source, build the server bundle before enabling WSL mode:

```bash
# From the repo root (on Windows or WSL)
bun run server:build
```

This produces `resources/wsl-server/index.js` — a single-file esbuild bundle of the backend. Native modules (`better-sqlite3`, `node-pty`) are external and installed via npm inside WSL during setup.

## Manual Server Setup

If the automatic setup fails, you can install manually:

```bash
# Inside WSL
mkdir -p ~/.local/share/1code/server
mkdir -p ~/.local/share/1code/bin
mkdir -p ~/.local/share/1code/data

# Copy server bundle (adjust the Windows path)
cp /mnt/c/Users/<YOU>/AppData/Local/Programs/1code/resources/wsl-server/index.js \
   ~/.local/share/1code/server/index.js

# Install native dependencies
cd ~/.local/share/1code/server
npm init -y
npm install better-sqlite3 node-pty

# Copy Claude binary (if available)
cp /mnt/c/Users/<YOU>/AppData/Local/Programs/1code/resources/bin/linux-x64/claude \
   ~/.local/share/1code/bin/claude
chmod +x ~/.local/share/1code/bin/claude
```

## Running the Server Manually (Debug)

For development or debugging, you can run the WSL server standalone:

```bash
# Inside WSL
cd ~/.local/share/1code/server
ONECODE_SERVER_PORT=19100 node index.js
```

The server will print:
```
[1code-server] Starting WSL backend server...
[1code-server] Control channel listening on ws://localhost:19101
[1code-server] Waiting for auth token from Electron shell...
```

It will wait up to 60 seconds for the Electron shell to connect and send an auth token. For standalone testing without Electron, set the token directly:

```bash
ANTHROPIC_AUTH_TOKEN=<your-token> ONECODE_SERVER_PORT=19100 node index.js
```

## Reinstalling / Updating

If the server needs updating after a 1Code update:

1. Go to **Settings > WSL**
2. Click **Reinstall Server**

Or manually:
```bash
# Inside WSL
rm -rf ~/.local/share/1code/server/node_modules
# Then repeat the setup steps above
```

## Disabling WSL Mode

1. Go to **Settings > WSL**
2. Toggle **Enable WSL Mode** off
3. Restart 1Code

The app reverts to standard Electron mode with everything running on Windows.

## Limitations

- **MCP servers** must be Linux executables installed inside WSL. Windows-native MCP servers are not supported in WSL mode.
- **File dialogs** open on the Windows side. Paths are translated to WSL-accessible `/mnt/` paths automatically.
- **Performance** is equivalent to native — the WebSocket runs over localhost with sub-millisecond latency.
- **Port 19100-19101** must be free. If something else uses those ports, set `ONECODE_SERVER_PORT` to a different base port.

## Troubleshooting

### "WSL is not available on this system"
Install WSL: `wsl --install` in an elevated PowerShell, then reboot.

### "Node.js is not installed"
Install Node.js inside your WSL distro (see Prerequisites above).

### Server fails to start
Check the WSL distro is running: `wsl -d Ubuntu -- echo ok`

Check Node.js works: `wsl -d Ubuntu -- node --version`

### "Timed out waiting for auth token"
The Electron shell couldn't connect to the control channel. Check that port 19101 is not blocked by a firewall and that the WSL networking is functional (`wsl -- curl http://localhost:19101` from Windows).

### Database errors
Ensure `~/.local/share/1code/data/` exists and is writable. SQLite requires a native filesystem — do not place the database on a Windows mount (`/mnt/c/...`), as 9p filesystem locking is unreliable.
