import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { app } from "electron"
import { z } from "zod"
import { publicProcedure, router } from "../index"
import {
  isWSLAvailable,
  listWSLDistros,
  isServerRunning,
} from "../../../wsl/server-manager"
import { isWSLServerInstalled, isNodeInstalledInWSL, installWSLServer } from "../../../wsl/setup"

/** Path to the WSL settings file. */
function getSettingsPath(): string {
  return join(app.getPath("userData"), "wsl-settings.json")
}

interface WSLSettings {
  enabled: boolean
  distro: string
}

function readSettings(): WSLSettings {
  try {
    const settingsPath = getSettingsPath()
    if (existsSync(settingsPath)) {
      const data = JSON.parse(readFileSync(settingsPath, "utf-8"))
      if (typeof data.enabled === "boolean" && typeof data.distro === "string") {
        return data as WSLSettings
      }
    }
  } catch {
    // Ignore
  }
  return { enabled: false, distro: "" }
}

function writeSettings(settings: WSLSettings): void {
  const settingsPath = getSettingsPath()
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8")
}

export const wslRouter = router({
  /**
   * Get current WSL status and configuration.
   */
  status: publicProcedure.query(() => {
    const settings = readSettings()
    return {
      available: isWSLAvailable(),
      distros: listWSLDistros(),
      settings,
      serverRunning: isServerRunning(),
      serverInstalled: settings.distro
        ? isWSLServerInstalled(settings.distro)
        : false,
      nodeInstalled: settings.distro
        ? isNodeInstalledInWSL(settings.distro)
        : false,
    }
  }),

  /**
   * Enable WSL mode: save settings, install server if needed.
   * Requires app restart to take effect.
   */
  enable: publicProcedure
    .input(z.object({ distro: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Verify WSL is available
      if (!isWSLAvailable()) {
        return { success: false, error: "WSL is not available on this system" }
      }

      // Verify distro exists
      const distros = listWSLDistros()
      if (!distros.includes(input.distro)) {
        return { success: false, error: `Distro "${input.distro}" not found` }
      }

      // Check for Node.js in the distro
      if (!isNodeInstalledInWSL(input.distro)) {
        return {
          success: false,
          error: `Node.js is not installed in "${input.distro}". Install it with: wsl -d ${input.distro} -- sudo apt install nodejs npm`,
        }
      }

      // Install server if not already installed
      if (!isWSLServerInstalled(input.distro)) {
        try {
          await installWSLServer(input.distro)
        } catch (err) {
          return {
            success: false,
            error: `Server installation failed: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      }

      // Save settings
      writeSettings({ enabled: true, distro: input.distro })

      return {
        success: true,
        message: "WSL mode enabled. Restart the app to activate.",
      }
    }),

  /**
   * Disable WSL mode. Requires app restart to take effect.
   */
  disable: publicProcedure.mutation(() => {
    writeSettings({ enabled: false, distro: "" })
    return {
      success: true,
      message: "WSL mode disabled. Restart the app to deactivate.",
    }
  }),

  /**
   * Re-install the WSL server (for updates or repairs).
   */
  reinstall: publicProcedure.mutation(async () => {
    const settings = readSettings()
    if (!settings.distro) {
      return { success: false, error: "No distro configured" }
    }
    try {
      await installWSLServer(settings.distro)
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }),
})
