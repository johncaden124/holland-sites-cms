// @ts-check
/**
 * A stand-in for the hub, serving a template's own captured fixtures — enough for a real CMS build,
 * and so for `site-cms parity`, without a Payload hub, a database or a secret.
 *
 *   node scripts/mock-hub.mjs <template-dir> [--port 3000]
 *
 * - `GET /api/<collection>?…` → `<template>/src/lib/__fixtures__/hub-<collection>.json`, verbatim.
 *   Those are `capture-fixtures` output: exactly what the demo tenant's hub served.
 * - `GET /api/media/file/<name>?prefix=…` → `<name>` from the template's `src/assets/` or `public/`.
 *   The fixtures were captured from a dev hub on `http://localhost:3000`, so their media URLs point
 *   here, and serving the template's own files keeps the two builds' images identical.
 *
 * Any `authorization` header is accepted; a request without one gets a 401, as from the real hub.
 * Used by the consumer smoke workflow; handy locally too.
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const [templateDir, ...rest] = process.argv.slice(2)
if (!templateDir) {
  console.error('usage: node scripts/mock-hub.mjs <template-dir> [--port 3000]')
  process.exit(1)
}
const port = Number(rest[rest.indexOf('--port') + 1] ?? 3000) || 3000
const root = resolve(templateDir)
const fixtures = resolve(root, 'src/lib/__fixtures__')
if (!existsSync(fixtures)) {
  console.error(`mock-hub: no fixtures at ${fixtures}`)
  process.exit(1)
}

/** @type {Record<string, string>} */
const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const media = /^\/api\/media\/file\/([^/]+)$/.exec(url.pathname)
  if (media) {
    const name = decodeURIComponent(/** @type {string} */ (media[1]))
    const file = ['src/assets', 'public'].map((d) => resolve(root, d, name)).find((f) => existsSync(f))
    if (!file) return void res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream' })
    return void res.end(readFileSync(file))
  }
  const api = /^\/api\/([a-z-]+)$/.exec(url.pathname)
  if (api) {
    if (!req.headers.authorization) {
      res.writeHead(401, { 'content-type': 'application/json' })
      return void res.end(JSON.stringify({ errors: [{ message: 'You are not allowed to perform this action.' }] }))
    }
    const file = resolve(fixtures, `hub-${api[1]}.json`)
    if (!existsSync(file)) return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"errors":[{"message":"Not Found"}]}')
    res.writeHead(200, { 'content-type': 'application/json' })
    return void res.end(readFileSync(file))
  }
  res.writeHead(404).end()
}).listen(port, () => console.log(`mock-hub: serving ${fixtures} on http://localhost:${port}`))
