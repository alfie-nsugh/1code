import { execSync } from "node:child_process"
import * as os from "node:os"
import * as path from "node:path"
import type {
  HostAPI,
  OpenDialogOptions,
  OpenDialogResult,
} from "../shared/host-api"
import type { ControlChannel } from "./control-channel"

/**
 * HostAPI implementation for WSL server mode.
 *
 * - Path resolution uses XDG / Linux conventions
 * - UI operations are proxied to the Electron shell via a control channel
 * - safeStorage is not available — tokens arrive already-decrypted
 */
export class WSLServerHostAPI implements HostAPI {
  private controlChannel: ControlChannel | null = null
  private readonly dataDir: string
  private readonly appPathDir: string

  constructor() {
    this.dataDir = path.join(
      process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
      "1code",
    )
    // In server mode, appPath is the directory containing this entry point
    this.appPathDir = path.resolve(__dirname, "..")
  }

  /** Wire up the control channel after it's ready. */
  setControlChannel(channel: ControlChannel): void {
    this.controlChannel = channel
  }

  // -- Paths ----------------------------------------------------------------

  getDataDir(): string {
    return this.dataDir
  }

  getHomeDir(): string {
    return os.homedir()
  }

  getResourcesDir(): string {
    // Resources (migrations, etc.) live alongside the server bundle.
    // Works for both dev (resources/wsl-server/) and production (~/.local/share/1code/server/).
    return __dirname
  }

  getAppPath(): string {
    return this.appPathDir
  }

  isPackaged(): boolean {
    // WSL server is always considered "packaged" (no dev reload)
    return true
  }

  getVersion(): string {
    return process.env.ONECODE_VERSION || "0.0.0-wsl"
  }

  // -- Secure storage -------------------------------------------------------
  // In WSL mode, we don't have OS-level encryption. Tokens are sent
  // already-decrypted from the Electron shell at startup.

  encryptString(plaintext: string): Buffer {
    return Buffer.from(plaintext, "utf-8")
  }

  decryptString(encrypted: Buffer): string {
    return encrypted.toString("utf-8")
  }

  isEncryptionAvailable(): boolean {
    return false
  }

  // -- Dialogs (proxied to Electron) ----------------------------------------

  async showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult> {
    if (!this.controlChannel) {
      return { canceled: true, filePaths: [] }
    }
    return this.controlChannel.request<OpenDialogResult>(
      "showOpenDialog",
      options,
    )
  }

  // -- Shell operations -----------------------------------------------------

  async openExternal(url: string): Promise<void> {
    if (this.controlChannel) {
      await this.controlChannel.request("openExternal", { url })
    }
  }

  async openPath(fullPath: string): Promise<string> {
    try {
      execSync(`xdg-open "${fullPath}"`, { stdio: "ignore" })
      return ""
    } catch {
      return `Failed to open ${fullPath}`
    }
  }

  showItemInFolder(fullPath: string): void {
    try {
      execSync(`xdg-open "${path.dirname(fullPath)}"`, { stdio: "ignore" })
    } catch {
      // Best-effort — may not have a display in WSL
    }
  }

  async trashItem(fullPath: string): Promise<void> {
    // Use gio trash if available, fall back to rm
    try {
      execSync(`gio trash "${fullPath}"`, { stdio: "ignore" })
    } catch {
      const { rm } = await import("node:fs/promises")
      await rm(fullPath, { recursive: true })
    }
  }

  // -- Clipboard (proxied to Electron) --------------------------------------

  clipboardWrite(text: string): void {
    this.controlChannel
      ?.request("clipboardWrite", { text })
      .catch(() => {
        // Best-effort
      })
  }

  clipboardRead(): string {
    // Synchronous clipboard read can't be proxied easily over WebSocket.
    // Return empty string — clipboard operations primarily go through
    // the renderer's desktopApi bridge.
    return ""
  }

  // -- Renderer communication -----------------------------------------------

  emitToRenderer(channel: string, ...args: unknown[]): void {
    this.controlChannel
      ?.request("emitToRenderer", { channel, args })
      .catch(() => {
        // Best-effort
      })
  }
}
