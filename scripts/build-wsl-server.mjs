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
import { mkdirSync } from "fs"

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
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  sourcemap: true,
})

console.log(`WSL server bundle built: ${join(outdir, "index.js")}`)
