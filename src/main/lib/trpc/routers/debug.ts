import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats, subChats } from "../../db"
import { getHostAPI } from "../../../../shared/host-api"
import { getAuthManager } from "../../../index"
import { z } from "zod"
import { clearNetworkCache } from "../../ollama/network-detector"

// Protocol constant (must match main/index.ts)
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL
const PROTOCOL = IS_DEV ? "twentyfirst-agents-dev" : "twentyfirst-agents"

/**
 * Check if the app is registered as the default protocol handler.
 * Uses Electron's app.isDefaultProtocolClient() when available,
 * returns false in non-Electron environments (e.g. WSL server).
 */
function checkProtocolRegistration(): boolean {
  try {
    // Dynamic import to avoid hard dependency on electron
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron")
    return process.defaultApp
      ? app.isDefaultProtocolClient(
          PROTOCOL,
          process.execPath,
          [process.argv[1]!],
        )
      : app.isDefaultProtocolClient(PROTOCOL)
  } catch {
    return false
  }
}

// Global flag for simulating offline mode (for testing)
let simulateOfflineMode = false

/**
 * Check if offline mode is being simulated (for testing)
 * Used by network-detector.ts
 */
export function isOfflineSimulated(): boolean {
  return simulateOfflineMode
}

export const debugRouter = router({
  /**
   * Get system information for debug display
   */
  getSystemInfo: publicProcedure.query(() => {
    return {
      version: getHostAPI().getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
      userDataPath: getHostAPI().getDataDir(),
      protocolRegistered: checkProtocolRegistration(),
    }
  }),

  /**
   * Get database statistics
   */
  getDbStats: publicProcedure.query(() => {
    const db = getDatabase()
    const projectCount = db.select().from(projects).all().length
    const chatCount = db.select().from(chats).all().length
    const subChatCount = db.select().from(subChats).all().length

    return {
      projects: projectCount,
      chats: chatCount,
      subChats: subChatCount,
    }
  }),

  /**
   * Clear all chats and sub-chats (keeps projects)
   */
  clearChats: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete sub_chats first (foreign key constraint)
    db.delete(subChats).run()
    db.delete(chats).run()
    console.log("[Debug] Cleared all chats and sub-chats")
    return { success: true }
  }),

  /**
   * Clear all data (projects, chats, sub-chats)
   */
  clearAllData: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete in order due to foreign key constraints
    db.delete(subChats).run()
    db.delete(chats).run()
    db.delete(projects).run()
    console.log("[Debug] Cleared all database data")
    return { success: true }
  }),

  /**
   * Logout (clear auth only)
   */
  logout: publicProcedure.mutation(() => {
    const authManager = getAuthManager()
    authManager.logout()
    console.log("[Debug] User logged out")
    return { success: true }
  }),

  /**
   * Open userData folder in system file manager
   */
  openUserDataFolder: publicProcedure.mutation(() => {
    const userDataPath = getHostAPI().getDataDir()
    getHostAPI().openPath(userDataPath)
    console.log("[Debug] Opened userData folder:", userDataPath)
    return { success: true }
  }),

  /**
   * Get offline simulation status
   */
  getOfflineSimulation: publicProcedure.query(() => {
    return { enabled: simulateOfflineMode }
  }),

  /**
   * Set offline simulation status (for testing)
   */
  setOfflineSimulation: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      simulateOfflineMode = input.enabled
      // Clear network cache to force immediate re-check
      clearNetworkCache()
      console.log(`[Debug] Offline simulation ${input.enabled ? "enabled" : "disabled"}`)
      return { success: true, enabled: simulateOfflineMode }
    }),
})
