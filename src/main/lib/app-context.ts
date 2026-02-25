/**
 * Shared application context — re-exports functions that routers need
 * without pulling in the full Electron app lifecycle from src/main/index.ts.
 *
 * Routers should import from here instead of "../../../index".
 */

import { getAuthManager as getAuthManagerFromModule } from "../auth-manager"
import { getHostAPI } from "../../shared/host-api"

export function getAuthManager() {
  return getAuthManagerFromModule()
}

export function getBaseUrl(): string {
  if (getHostAPI().isPackaged()) {
    return "https://21st.dev"
  }
  return process.env.MAIN_VITE_API_URL || "https://21st.dev"
}

export function getAppUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || "https://21st.dev/agents"
}
