import { spawn, execSync, type ChildProcess } from "node:child_process"

const TRPC_PORT = 19100
const CONTROL_PORT = TRPC_PORT + 1

let serverProcess: ChildProcess | null = null

export interface WSLServerOptions {
  /** WSL distribution name (e.g. "Ubuntu"). */
  distro: string
  /** Called when the server prints "Ready." to stdout. */
  onReady: () => void
  /** Called when the server process exits. */
  onExit: (code: number | null) => void
  /** Called for each stdout line (optional logging hook). */
  onStdout?: (line: string) => void
  /** Called for each stderr line (optional logging hook). */
  onStderr?: (line: string) => void
}

/**
 * Start the 1code-server inside WSL.
 *
 * The server is a Node.js process that hosts the tRPC routers over WebSocket.
 * It reads ONECODE_SERVER_PORT from its environment.
 */
export function startWSLServer(options: WSLServerOptions): ChildProcess {
  const serverPath = "~/.local/share/1code/server/index.js"

  const args = ["-d", options.distro, "--", "node", serverPath]

  console.log(`[wsl-manager] Starting server: wsl.exe ${args.join(" ")}`)

  serverProcess = spawn("wsl.exe", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ONECODE_SERVER_PORT: String(TRPC_PORT),
    },
  })

  serverProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim()
    console.log(`[wsl-server] ${line}`)
    options.onStdout?.(line)
    if (line.includes("Ready.")) {
      options.onReady()
    }
  })

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim()
    console.error(`[wsl-server] ${line}`)
    options.onStderr?.(line)
  })

  serverProcess.on("exit", (code) => {
    console.log(`[wsl-manager] Server exited with code ${code}`)
    serverProcess = null
    options.onExit(code)
  })

  return serverProcess
}

/**
 * Stop the WSL server gracefully.
 * Sends SIGTERM first, then SIGKILL after 5 seconds.
 */
export function stopWSLServer(): void {
  if (serverProcess) {
    console.log("[wsl-manager] Stopping server...")
    serverProcess.kill("SIGTERM")
    const forceKillTimer = setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill("SIGKILL")
        serverProcess = null
      }
    }, 5000)
    serverProcess.on("exit", () => {
      clearTimeout(forceKillTimer)
    })
  }
}

/**
 * Check if WSL is available on this Windows system.
 */
export function isWSLAvailable(): boolean {
  try {
    execSync("wsl.exe --status", { stdio: "ignore", timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * List available WSL distributions.
 */
export function listWSLDistros(): string[] {
  try {
    const output = execSync("wsl.exe -l -q", {
      encoding: "utf-8",
      timeout: 5000,
    })
    return output
      .split("\n")
      .map((line: string) => line.replace(/\0/g, "").trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Returns the default ports used by the WSL server. */
export function getServerPorts() {
  return { trpc: TRPC_PORT, control: CONTROL_PORT } as const
}

/** Whether a WSL server process is currently running. */
export function isServerRunning(): boolean {
  return serverProcess !== null && !serverProcess.killed
}
