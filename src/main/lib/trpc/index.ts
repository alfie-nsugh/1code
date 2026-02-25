import { initTRPC } from "@trpc/server"
import superjson from "superjson"

/**
 * Context passed to all tRPC procedures.
 *
 * Previously included `getWindow` for accessing the BrowserWindow, but all
 * window operations are now handled by the HostAPI abstraction. The context
 * is kept as an empty interface for forward-compatibility.
 */
export interface Context {}

/**
 * Initialize tRPC with context and superjson transformer
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    }
  },
})

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

/**
 * Middleware to log procedure calls
 */
export const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const duration = Date.now() - start
  console.log(`[tRPC] ${type} ${path} - ${duration}ms`)
  return result
})

/**
 * Procedure with logging
 */
export const loggedProcedure = publicProcedure.use(loggerMiddleware)
