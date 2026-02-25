/**
 * ElectronHostAPI — concrete HostAPI backed by real Electron main-process APIs.
 *
 * Instantiated once in `createWindow()` (src/main/windows/main.ts) and
 * registered via `setHostAPI()`.  Every tRPC router that needs platform
 * services should call `getHostAPI()` instead of importing from "electron".
 */

import path from "path"
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  safeStorage,
  shell,
} from "electron"

import type {
  HostAPI,
  OpenDialogOptions,
  OpenDialogResult,
} from "../../shared/host-api"

export class ElectronHostAPI implements HostAPI {
  /**
   * @param getWindow  Returns the currently-focused BrowserWindow (or null).
   *                   Used as the parent for native dialogs so they attach
   *                   to the correct window.  Same getter that is passed to
   *                   `createAppRouter()`.
   */
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  // -- Paths ----------------------------------------------------------------

  getDataDir(): string {
    return app.getPath("userData")
  }

  getHomeDir(): string {
    return app.getPath("home")
  }

  getResourcesDir(): string {
    return app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), "resources")
  }

  getAppPath(): string {
    return app.getAppPath()
  }

  isPackaged(): boolean {
    return app.isPackaged
  }

  getVersion(): string {
    return app.getVersion()
  }

  // -- Secure storage -------------------------------------------------------

  encryptString(plaintext: string): Buffer {
    return safeStorage.encryptString(plaintext)
  }

  decryptString(encrypted: Buffer): string {
    return safeStorage.decryptString(encrypted)
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  // -- Dialogs --------------------------------------------------------------

  async showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult> {
    const win = this.getWindow()

    // Electron's showOpenDialog accepts an optional parent window.
    // When a window is available we pass it so the dialog is modal.
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    }
  }

  // -- Shell operations -----------------------------------------------------

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url)
  }

  async openPath(fullPath: string): Promise<string> {
    return shell.openPath(fullPath)
  }

  showItemInFolder(fullPath: string): void {
    shell.showItemInFolder(fullPath)
  }

  async trashItem(fullPath: string): Promise<void> {
    await shell.trashItem(fullPath)
  }

  // -- Clipboard ------------------------------------------------------------

  clipboardWrite(text: string): void {
    clipboard.writeText(text)
  }

  clipboardRead(): string {
    return clipboard.readText()
  }

  // -- Renderer communication -----------------------------------------------

  emitToRenderer(channel: string, ...args: unknown[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args)
      }
    }
  }
}
