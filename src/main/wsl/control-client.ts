import WebSocket from "ws"
import {
  BrowserWindow,
  clipboard,
  dialog,
  safeStorage,
  shell,
} from "electron"
import { anthropicAccounts, anthropicSettings, getDatabase } from "../lib/db"
import { eq } from "drizzle-orm"

/**
 * Control client: the Electron shell connects to the WSL server's control
 * channel WebSocket and handles proxied UI operations.
 *
 * Responsibilities:
 * 1. Send the decrypted auth token on connection (and reconnection)
 * 2. Handle requests from the WSL server: dialogs, clipboard, shell, emitToRenderer
 */
export class ControlClient {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private getWindow: () => BrowserWindow | null

  constructor(
    private port: number,
    getWindow: () => BrowserWindow | null,
  ) {
    this.getWindow = getWindow
  }

  /** Establish the WebSocket connection to the WSL server's control channel. */
  connect(): void {
    this.ws = new WebSocket(`ws://localhost:${this.port}`)

    this.ws.on("open", () => {
      console.log(
        "[control-client] Connected to WSL server control channel",
      )
      this.sendAuthToken()
    })

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === "request") {
          this.handleRequest(msg)
        }
      } catch (e) {
        console.error("[control-client] Failed to parse message:", e)
      }
    })

    this.ws.on("close", () => {
      console.log("[control-client] Disconnected from WSL server")
      this.ws = null
      // Reconnect after 2 seconds
      this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    })

    this.ws.on("error", (err) => {
      console.error("[control-client] WebSocket error:", err.message)
    })
  }

  /** Cleanly disconnect from the control channel. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // -------------------------------------------------------------------------
  // Auth token management
  // -------------------------------------------------------------------------

  /**
   * Decrypt and send the active account's OAuth token to the WSL server.
   * Called on initial connection and reconnection.
   */
  private sendAuthToken(): void {
    try {
      const db = getDatabase()
      const settings = db.select().from(anthropicSettings).get()
      if (!settings?.activeAccountId) {
        console.warn("[control-client] No active Anthropic account")
        return
      }

      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get()

      if (!account) return

      // Decrypt the token using Electron's safeStorage
      let token: string
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(account.oauthToken, "base64")
        token = safeStorage.decryptString(buffer)
      } else {
        token = Buffer.from(account.oauthToken, "base64").toString("utf-8")
      }

      this.ws?.send(JSON.stringify({ type: "token", token }))
      console.log("[control-client] Auth token sent to WSL server")
    } catch (err) {
      console.error("[control-client] Failed to send auth token:", err)
    }
  }

  // -------------------------------------------------------------------------
  // Request handling — proxy UI ops from WSL server → Electron APIs
  // -------------------------------------------------------------------------

  private async handleRequest(msg: {
    id: string
    method: string
    params: Record<string, unknown>
  }): Promise<void> {
    let result: unknown
    let error: string | undefined

    try {
      switch (msg.method) {
        case "showOpenDialog": {
          const win =
            this.getWindow() ?? BrowserWindow.getFocusedWindow()
          if (!win) {
            result = { canceled: true, filePaths: [] }
            break
          }
          result = await dialog.showOpenDialog(
            win,
            msg.params as Electron.OpenDialogOptions,
          )
          break
        }

        case "openExternal":
          await shell.openExternal(msg.params.url as string)
          result = true
          break

        case "clipboardWrite":
          clipboard.writeText(msg.params.text as string)
          result = true
          break

        case "emitToRenderer": {
          const { channel, args } = msg.params as {
            channel: string
            args: unknown[]
          }
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send(channel, ...args)
            }
          }
          result = true
          break
        }

        default:
          error = `Unknown control method: ${msg.method}`
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    this.ws?.send(
      JSON.stringify({ type: "response", id: msg.id, result, error }),
    )
  }
}
