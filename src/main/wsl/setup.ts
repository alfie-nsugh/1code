import { execSync, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"

/**
 * Convert a Windows path to a path accessible from WSL.
 * E.g., C:\Users\avi\app\file → /mnt/c/Users/avi/app/file
 */
function windowsToWSLPath(winPath: string): string {
  // Can't translate UNC paths
  if (winPath.startsWith("\\\\")) {
    return winPath
  }
  // C:\foo\bar → /mnt/c/foo/bar
  const drive = winPath[0]!.toLowerCase()
  const rest = winPath.slice(2).replace(/\\/g, "/")
  return `/mnt/${drive}${rest}`
}

/**
 * Install the 1code-server components into a WSL distro.
 *
 * Called on first enable of WSL mode, or when server files are missing.
 * Copies the server bundle and Claude binary into the WSL filesystem,
 * then installs native npm dependencies (better-sqlite3, node-pty).
 */
export async function installWSLServer(
  distro: string,
  onProgress?: (message: string) => void,
): Promise<void> {
  const serverBundlePath = app.isPackaged
    ? join(process.resourcesPath, "wsl-server", "index.js")
    : join(app.getAppPath(), "resources", "wsl-server", "index.js")

  const claudeBinaryPath = app.isPackaged
    ? join(process.resourcesPath, "bin", "linux-x64", "claude")
    : join(app.getAppPath(), "resources", "bin", "linux-x64", "claude")

  // Verify source files exist on Windows side
  if (!existsSync(serverBundlePath)) {
    throw new Error(
      `Server bundle not found at ${serverBundlePath}. Run "bun run server:build" first.`,
    )
  }

  // Translate Windows paths to WSL-accessible paths
  const wslServerBundle = windowsToWSLPath(serverBundlePath)
  const wslClaudeBinary = windowsToWSLPath(claudeBinaryPath)

  const setupScript = `
    set -e

    echo "PROGRESS: Creating directories..."
    mkdir -p ~/.local/share/1code/server
    mkdir -p ~/.local/share/1code/bin
    mkdir -p ~/.local/share/1code/data

    echo "PROGRESS: Copying server bundle..."
    cp "${wslServerBundle}" ~/.local/share/1code/server/index.js

    # Copy Claude binary if available
    if [ -f "${wslClaudeBinary}" ]; then
      echo "PROGRESS: Copying Claude binary..."
      cp "${wslClaudeBinary}" ~/.local/share/1code/bin/claude
      chmod +x ~/.local/share/1code/bin/claude
    else
      echo "PROGRESS: Claude binary not found, skipping..."
    fi

    # Install native dependencies if node_modules missing
    if [ ! -d ~/.local/share/1code/server/node_modules ]; then
      echo "PROGRESS: Installing native dependencies (this may take a minute)..."
      cd ~/.local/share/1code/server
      npm init -y 2>/dev/null
      npm install better-sqlite3 node-pty ws 2>/dev/null
    fi

    echo "SETUP_COMPLETE"
  `

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "wsl.exe",
      ["-d", distro, "--", "bash", "-c", setupScript],
      { stdio: ["pipe", "pipe", "pipe"] },
    )

    let stdout = ""
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString()
      stdout += text
      // Extract progress messages
      for (const line of text.split("\n")) {
        const match = line.match(/^PROGRESS: (.+)/)
        if (match) {
          onProgress?.(match[1]!)
        }
      }
    })

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[wsl-setup] ${data.toString().trim()}`)
    })

    proc.on("exit", (code) => {
      if (code === 0 && stdout.includes("SETUP_COMPLETE")) {
        resolve()
      } else {
        reject(new Error(`WSL setup failed with exit code ${code}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn wsl.exe: ${err.message}`))
    })
  })
}

/**
 * Check if the WSL server is already installed in a distro.
 */
export function isWSLServerInstalled(distro: string): boolean {
  try {
    const result = execSync(
      `wsl.exe -d ${distro} -- test -f ~/.local/share/1code/server/index.js && echo YES`,
      { encoding: "utf-8", timeout: 5000 },
    )
    return result.trim().includes("YES")
  } catch {
    return false
  }
}

/**
 * Check if Node.js is available in a WSL distro.
 */
export function isNodeInstalledInWSL(distro: string): boolean {
  try {
    execSync(`wsl.exe -d ${distro} -- node --version`, {
      stdio: "ignore",
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}
