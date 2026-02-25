# WSL Split Architecture — End-to-End Testing Checklist

Manual testing guide for the WSL split architecture. Requires a Windows machine with WSL 2 and a Linux distro with Node.js 20+.

## Prerequisites

- [ ] Windows 10/11 with WSL 2
- [ ] Ubuntu (or other distro) with Node.js 20+ (`node --version`)
- [ ] Built the app: `bun run build`
- [ ] Built the WSL server bundle: `bun run server:build`
- [ ] Verify `resources/wsl-server/index.js` exists

## 1. Settings UI

### WSL Tab Visibility
- [ ] On Windows: "WSL" tab appears in Settings > Advanced section
- [ ] On macOS/Linux: "WSL" tab is hidden (not in sidebar)

### WSL Tab Content
- [ ] Available distros populate the dropdown (should match `wsl -l -q` output)
- [ ] WSL availability status shows green when WSL is installed
- [ ] "Enable WSL Mode" toggle is functional
- [ ] Server status indicators show correct initial state (Stopped, etc.)

### Enable Flow
- [ ] Select a distro from dropdown
- [ ] Toggle "Enable WSL Mode" on
- [ ] Success message appears: "WSL mode enabled. Restart the app to activate."
- [ ] If Node.js is missing in distro, error message appears with install instructions
- [ ] First enable triggers server installation (copies bundle + installs native deps)

### Disable Flow
- [ ] Toggle "Enable WSL Mode" off
- [ ] Success message: "WSL mode disabled. Restart the app to deactivate."
- [ ] After restart, app runs in normal Electron mode

## 2. Server Lifecycle

### Startup
- [ ] After enabling WSL mode and restarting, server starts automatically
- [ ] Check stdout: `[1code-server] Ready.` appears
- [ ] Settings > WSL shows server status as "Running" (green indicator)
- [ ] Control channel connects (port 19101)
- [ ] Auth token is sent to server within seconds

### Shutdown
- [ ] Closing 1Code stops the WSL server process
- [ ] No orphaned `node` processes remain in WSL (`ps aux | grep 1code`)
- [ ] Force-quitting 1Code also cleans up (SIGKILL fallback after 5s)

### Crash Recovery
- [ ] Kill the WSL server manually: `wsl -- pkill -f 1code`
- [ ] Electron should detect the exit and could auto-restart (or show error)
- [ ] App remains usable after recovery

## 3. Core Functionality (WSL Mode)

### Chat / Claude SDK
- [ ] Start a new chat — Claude responds normally
- [ ] Multi-turn conversation works
- [ ] Streaming responses render in real-time
- [ ] Claude can read files in the WSL filesystem
- [ ] Claude can write/edit files in the WSL filesystem

### Terminal
- [ ] Open a terminal tab — spawns a bash/zsh shell inside WSL
- [ ] `pwd` shows a Linux path (e.g., `/home/user/...`)
- [ ] `uname -a` shows Linux kernel
- [ ] Terminal resize works (drag to resize, fullscreen)
- [ ] Long-running commands work (e.g., `sleep 5 && echo done`)
- [ ] Ctrl+C interrupts running commands
- [ ] Multiple terminal tabs work simultaneously

### File Operations
- [ ] Browse project files — shows WSL filesystem paths
- [ ] Open a file — content loads correctly
- [ ] File search/grep works across the project
- [ ] File watching detects external changes

### Git Operations
- [ ] Git status shows correct output
- [ ] Git diff renders properly
- [ ] Commit creation works
- [ ] Branch switching works
- [ ] Git log displays correctly

### Projects
- [ ] Create a new project pointing to a WSL directory
- [ ] Open an existing project — files and terminal work
- [ ] Switch between projects
- [ ] Project paths are Linux paths (not Windows /mnt/ paths)

## 4. UI Operations Proxy (Control Channel)

These operations proxy from the WSL server back to the Windows Electron shell.

### File Dialogs
- [ ] "Open Folder" opens a Windows file dialog
- [ ] Selected path is translated to WSL-accessible path
- [ ] Cancel returns gracefully (no error)

### Clipboard
- [ ] Copy from terminal — text appears in Windows clipboard
- [ ] Copy code block — available in Windows clipboard

### Shell Operations
- [ ] "Open in browser" links open in Windows default browser
- [ ] "Reveal in Explorer" works (opens Windows Explorer)

### Auth / Tokens
- [ ] OAuth login flow works (opens browser on Windows, token reaches WSL server)
- [ ] Existing auth persists across restarts
- [ ] Token refresh works if token expires during session

## 5. Database

- [ ] Database is created at `~/.local/share/1code/data/agents.db` in WSL
- [ ] Chat history persists across app restarts
- [ ] Project list persists across app restarts
- [ ] No database locking errors in the server log

## 6. Backward Compatibility

### Normal Mode (WSL Disabled)
- [ ] With WSL mode OFF, app starts normally (no WSL server launched)
- [ ] All functionality works identically to before the changes
- [ ] No regressions in chat, terminal, file ops, git
- [ ] IPC transport used (not WebSocket)
- [ ] No WSL-related errors in console

### macOS
- [ ] App runs without errors (no WSL code paths activated)
- [ ] No "wsl" references in console output
- [ ] All features work normally

## 7. Edge Cases

- [ ] Start app with no WSL installed → WSL tab shows "not available" message
- [ ] Start app with WSL but no distros → dropdown is empty, toggle shows error
- [ ] Start app with WSL mode enabled but distro was unregistered → graceful error
- [ ] Network: ports 19100-19101 already in use → server fails with clear error
- [ ] Rapid toggle on/off in settings → no race conditions
- [ ] Open settings while server is starting → status updates as server comes online
- [ ] Reinstall server while server is running → completes without errors

## 8. Performance Sanity

- [ ] Chat response latency feels identical to non-WSL mode
- [ ] Terminal input latency is imperceptible
- [ ] File operations (open, search) are responsive
- [ ] No memory leaks after extended use (check with `ps aux` in WSL)
- [ ] CPU usage at idle is minimal (no busy polling)

## Test Results Template

```
Date: ____
Tester: ____
Windows Version: ____
WSL Distro: ____
Node.js Version: ____
1Code Branch: feat/wsl-split-architecture
1Code Commit: ____

Sections Passed: __ / 8
Issues Found:
  1. ____
  2. ____
  3. ____
```
