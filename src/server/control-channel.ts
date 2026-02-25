import { WebSocket, WebSocketServer } from "ws"

export interface ControlChannel {
  /** Send a request to the Electron shell and await its response. */
  request<T>(method: string, params: unknown): Promise<T>
  /** Register a callback for when the Electron shell sends an auth token. */
  onTokenReceived(callback: (token: string) => void): void
  /** Shut down the control channel server. */
  close(): void
}

/**
 * Control channel: a secondary WebSocket that the Electron shell connects to.
 * Used for proxying UI operations (dialogs, clipboard) and receiving auth tokens.
 */
export function createControlChannel(port: number): ControlChannel {
  const wss = new WebSocketServer({ port })
  let electronSocket: WebSocket | null = null
  const pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()
  let tokenCallback: ((token: string) => void) | null = null
  let requestCounter = 0

  // Heartbeat — detect stale connections
  const heartbeatInterval = setInterval(() => {
    if (electronSocket?.readyState === WebSocket.OPEN) {
      electronSocket.ping()
    }
  }, 5000)

  wss.on("connection", (ws) => {
    console.log("[control] Electron shell connected")
    electronSocket = ws

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === "response") {
          const pending = pendingRequests.get(msg.id)
          if (pending) {
            pendingRequests.delete(msg.id)
            if (msg.error) pending.reject(new Error(msg.error))
            else pending.resolve(msg.result)
          }
        } else if (msg.type === "token") {
          tokenCallback?.(msg.token)
        }
      } catch (e) {
        console.error("[control] Failed to parse message:", e)
      }
    })

    ws.on("close", () => {
      console.log("[control] Electron shell disconnected")
      electronSocket = null
      // Reject all pending requests
      for (const [, { reject }] of pendingRequests) {
        reject(new Error("Control channel disconnected"))
      }
      pendingRequests.clear()
    })
  })

  return {
    request<T>(method: string, params: unknown): Promise<T> {
      return new Promise((resolve, reject) => {
        if (!electronSocket || electronSocket.readyState !== WebSocket.OPEN) {
          reject(new Error("Control channel not connected"))
          return
        }
        const id = String(++requestCounter)
        pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        })
        electronSocket.send(
          JSON.stringify({ type: "request", id, method, params }),
        )

        // Timeout after 30 seconds (dialogs may take a while)
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id)
            reject(new Error(`Control channel request "${method}" timed out`))
          }
        }, 30_000)
      })
    },

    onTokenReceived(callback: (token: string) => void): void {
      tokenCallback = callback
    },

    close(): void {
      clearInterval(heartbeatInterval)
      electronSocket?.close()
      wss.close()
    },
  }
}
