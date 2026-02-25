#!/usr/bin/env node
/**
 * Build the WSL server as a standalone Node.js bundle.
 * Output: resources/wsl-server/index.js (single file, all dependencies bundled)
 *
 * Usage:
 *   node scripts/build-wsl-server.mjs
 */
import { build } from "esbuild"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { mkdirSync, cpSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const outdir = join(root, "resources", "wsl-server")

// Ensure output directory exists
mkdirSync(outdir, { recursive: true })

await build({
  entryPoints: [join(root, "src/server/index.ts")],
  outfile: join(outdir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: [
    // Native modules — must be installed in WSL via npm
    "better-sqlite3",
    "node-pty",
    // ws is installed alongside the server in WSL
    "ws",
    // Electron is never available in the WSL server
    "electron",
    // Codex binary resolved at runtime via require.resolve
    "@zed-industries/codex-acp",
    "@zed-industries/codex-acp/*",
    // jsonc-parser UMD has dynamic require('./impl/format') that can't be bundled
    "jsonc-parser",
  ],
  alias: {
    // Replace Sentry with a no-op stub — @sentry/electron depends on
    // Electron APIs that don't exist in the WSL server process.
    "@sentry/electron/main": join(__dirname, "stubs/sentry.js"),
    "@sentry/electron": join(__dirname, "stubs/sentry.js"),
  },
  // Polyfill import.meta.url for ESM modules bundled into CJS (e.g. @mcpc-tech/acp-ai-provider
  // uses createRequire(import.meta.url) which is undefined in CJS format).
  banner: {
    js: `var __import_meta_url = require("url").pathToFileURL(__filename).href;`,
  },
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.url": "__import_meta_url",
    // Stub import.meta.env for Vite-specific code pulled in transitively
    "import.meta.env": "{}",
  },
  sourcemap: true,
})

// Copy Drizzle migrations alongside the bundle so the WSL server can find them
const migrationsSource = join(root, "drizzle")
const migrationsDest = join(outdir, "migrations")
cpSync(migrationsSource, migrationsDest, { recursive: true })

console.log(`WSL server bundle built: ${join(outdir, "index.js")}`)
console.log(`Migrations copied to: ${migrationsDest}`)
