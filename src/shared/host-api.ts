/**
 * HostAPI — platform-agnostic abstraction over Electron's main-process APIs.
 *
 * Every tRPC router that formerly imported `app`, `dialog`, `shell`,
 * `clipboard`, `safeStorage`, or `BrowserWindow` from "electron" should
 * instead call `getHostAPI()`.
 *
 * Two concrete implementations will exist:
 *   1. ElectronHostAPI  – delegates to the real Electron APIs (runs in-process).
 *   2. WslHostAPI       – delegates to a lightweight Node.js server on WSL
 *                         that proxies UI calls back to the Windows host.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Subset of Electron's `OpenDialogOptions` used across the routers.
 *
 * We intentionally keep this minimal — only the fields the codebase actually
 * passes to `dialog.showOpenDialog()` are included.
 */
export interface OpenDialogOptions {
  /** Which capabilities the dialog should expose. */
  properties?: Array<
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
    | "dontAddToRecent"
  >
  /** Window title. */
  title?: string
  /** Default path the dialog opens to. */
  defaultPath?: string
  /** Label for the confirmation button. */
  buttonLabel?: string
  /** File-type filters (e.g. `{ name: "Images", extensions: ["png", "jpg"] }`). */
  filters?: Array<{ name: string; extensions: string[] }>
}

/** Return value that mirrors Electron's `OpenDialogReturnValue`. */
export interface OpenDialogResult {
  /** `true` when the user dismissed the dialog without choosing. */
  canceled: boolean
  /** Absolute paths of the selected files / directories. */
  filePaths: string[]
}

// ---------------------------------------------------------------------------
// HostAPI interface
// ---------------------------------------------------------------------------

export interface HostAPI {
  // -- Paths ----------------------------------------------------------------

  /**
   * Application-specific data directory (databases, logs, cached state).
   * Electron equivalent: `app.getPath("userData")`.
   */
  getDataDir(): string

  /**
   * User's home directory.
   * Electron equivalent: `app.getPath("home")`.
   */
  getHomeDir(): string

  /**
   * Root directory for bundled resources (binaries, migrations, etc.).
   *
   * In Electron this resolves to either `process.resourcesPath` (packaged)
   * or a `resources/` subfolder of `app.getAppPath()` (dev).
   */
  getResourcesDir(): string

  /**
   * Application root path (the directory containing package.json in dev,
   * or the asar / unpacked app directory in production).
   * Electron equivalent: `app.getAppPath()`.
   */
  getAppPath(): string

  /**
   * Whether the app is running from a packaged build (e.g. an .exe / .dmg)
   * rather than a development checkout.
   * Electron equivalent: `app.isPackaged`.
   */
  isPackaged(): boolean

  /**
   * Semantic version string of the application.
   * Electron equivalent: `app.getVersion()`.
   */
  getVersion(): string

  // -- Secure storage -------------------------------------------------------

  /**
   * Encrypt a plaintext string using the OS credential store.
   * Electron equivalent: `safeStorage.encryptString()`.
   * Returns a `Buffer` that can be persisted (typically base64-encoded).
   */
  encryptString(plaintext: string): Buffer

  /**
   * Decrypt a buffer previously produced by `encryptString()`.
   * Electron equivalent: `safeStorage.decryptString()`.
   */
  decryptString(encrypted: Buffer): string

  /**
   * Whether the platform provides a usable credential store.
   * Electron equivalent: `safeStorage.isEncryptionAvailable()`.
   */
  isEncryptionAvailable(): boolean

  // -- Dialogs --------------------------------------------------------------

  /**
   * Show a native open-file / open-folder dialog.
   * Electron equivalent: `dialog.showOpenDialog()`.
   *
   * The implementation is responsible for focusing the appropriate window
   * (or ignoring the concept entirely on headless hosts).
   */
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>

  // -- Shell operations -----------------------------------------------------

  /**
   * Open a URL in the user's default browser.
   * Electron equivalent: `shell.openExternal()`.
   */
  openExternal(url: string): Promise<void>

  /**
   * Open a file or directory with the system's default handler.
   * Electron equivalent: `shell.openPath()`.
   * Returns an error string if the operation fails, or empty string on success.
   */
  openPath(fullPath: string): Promise<string>

  /**
   * Reveal a file in the OS file manager (Finder / Explorer).
   * Electron equivalent: `shell.showItemInFolder()`.
   */
  showItemInFolder(fullPath: string): void

  /**
   * Move a file or directory to the OS trash / recycle bin.
   * Electron equivalent: `shell.trashItem()`.
   */
  trashItem(fullPath: string): Promise<void>

  // -- Clipboard ------------------------------------------------------------

  /**
   * Write text to the system clipboard.
   * Electron equivalent: `clipboard.writeText()`.
   */
  clipboardWrite(text: string): void

  /**
   * Read text from the system clipboard.
   * Electron equivalent: `clipboard.readText()`.
   */
  clipboardRead(): string

  // -- Renderer communication -----------------------------------------------

  /**
   * Send a named event (with optional payload) to every renderer window.
   *
   * In Electron this iterates `BrowserWindow.getAllWindows()` and calls
   * `win.webContents.send(channel, ...args)`.
   *
   * In the WSL backend this will push the event over a WebSocket to all
   * connected renderer clients.
   */
  emitToRenderer(channel: string, ...args: unknown[]): void
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _hostApi: HostAPI | null = null

/**
 * Register the concrete HostAPI implementation.
 *
 * Must be called exactly once during startup — by `ElectronHostAPI` in the
 * Electron main process, or by `WslHostAPI` in the standalone WSL server.
 *
 * @throws if called more than once.
 */
export function setHostAPI(api: HostAPI): void {
  if (_hostApi !== null) {
    // Already initialized — skip silently.  This can happen because both
    // index.ts (early, before DB init) and createMainWindow() call setHostAPI
    // to ensure it's available regardless of startup order.
    return
  }
  _hostApi = api
}

/**
 * Retrieve the registered HostAPI implementation.
 *
 * All router code should call this instead of importing from "electron".
 *
 * @throws if `setHostAPI()` has not been called yet.
 */
export function getHostAPI(): HostAPI {
  if (_hostApi === null) {
    throw new Error(
      "getHostAPI() called before setHostAPI(). " +
        "Ensure the host implementation is registered during startup.",
    )
  }
  return _hostApi
}
