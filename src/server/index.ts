/**
 * 1Code WSL Backend Server
 *
 * Standalone Node.js server that runs inside WSL, hosting the same tRPC
 * router that normally runs in Electron's main process. Communication
 * with the renderer happens over WebSocket instead of Electron IPC.
 *
 * Usage:
 *   node dist/server/index.js
 *
 * Environment variables:
 *   ONECODE_SERVER_PORT  — tRPC WebSocket port   (default 19100)
 *   ONECODE_VERSION      — version string         (default 0.0.0-wsl)
 */

import { applyWSSHandler } from "@trpc/server/adapters/ws"
import { WebSocketServer } from "ws"
import { setHostAPI } from "../shared/host-api"
import { WSLServerHostAPI } from "./host-api-wsl"
import { createControlChannel } from "./control-channel"

const TRPC_PORT = parseInt(process.env.ONECODE_SERVER_PORT || "19100", 10)
const CONTROL_PORT = TRPC_PORT + 1 // 19101

async function main() {
  console.log("[1code-server] Starting WSL backend server...")

  // 1. Initialize HostAPI for WSL
  const hostApi = new WSLServerHostAPI()
  setHostAPI(hostApi)

  // 2. Start control channel (for Electron shell communication)
  const controlChannel = createControlChannel(CONTROL_PORT)
  hostApi.setControlChannel(controlChannel)
  console.log(
    `[1code-server] Control channel listening on ws://localhost:${CONTROL_PORT}`,
  )

  // 3. Get auth token — from env var (dev) or Electron control channel (production)
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(
      "[1code-server] Using auth token from ANTHROPIC_AUTH_TOKEN env var",
    )
  } else {
    console.log(
      "[1code-server] Waiting for auth token from Electron shell...",
    )
    const authToken = await Promise.race([
      new Promise<string>((resolve) => {
        controlChannel.onTokenReceived((token) => {
          console.log(
            "[1code-server] Received auth token from Electron shell",
          )
          resolve(token)
        })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error("Timed out waiting for auth token (60s)")),
          60_000,
        ),
      ),
    ])
    process.env.ANTHROPIC_AUTH_TOKEN = authToken
  }

  // 4. Initialize database (uses getHostAPI().getDataDir() for path)
  const { initDatabase } = await import("../main/lib/db")
  initDatabase()

  // 5. Create tRPC router and start WebSocket server
  const { createAppRouter } = await import("../main/lib/trpc/routers")
  const router = createAppRouter()

  const wss = new WebSocketServer({ port: TRPC_PORT })
  applyWSSHandler({
    wss,
    router,
    createContext: () => ({}),
  })

  console.log(
    `[1code-server] tRPC WebSocket listening on ws://localhost:${TRPC_PORT}`,
  )
  console.log("[1code-server] Ready.")

  // Graceful shutdown
  const shutdown = () => {
    console.log("[1code-server] Shutting down...")
    wss.close()
    controlChannel.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((err) => {
  console.error("[1code-server] Fatal error:", err)
  process.exit(1)
})
