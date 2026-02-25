import { createTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient, createWSClient, wsLink } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"

/** Check if WSL mode is enabled */
function isWSLMode(): boolean {
  if (typeof window === "undefined") return false
  // Only applicable on Windows hosts
  if (window.desktopApi?.platform !== "win32") return false
  return localStorage.getItem("1code-wsl-mode") === "true"
}

/** WSL server port — matches the server default */
const WSL_SERVER_PORT = 19100

function createLinks() {
  if (isWSLMode()) {
    const wsClient = createWSClient({
      url: `ws://localhost:${WSL_SERVER_PORT}`,
    })
    return [wsLink<AppRouter>({ client: wsClient, transformer: superjson })]
  }
  return [ipcLink({ transformer: superjson })]
}

/**
 * React hooks for tRPC
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Vanilla client for use outside React components (stores, utilities)
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: createLinks(),
})
