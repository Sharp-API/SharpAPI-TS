import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { compareOdds, BOOKS, LEAGUES } from './comparison.mjs'
import { sampleOdds } from './sample.mjs'

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
])
function safeError(error) {
  if (error?.status === 401)
    return 'API key rejected. Check SHARPAPI_API_KEY and restart the demo.'
  if (error?.status === 403)
    return 'This API key cannot access the requested data. Check your account permissions.'
  if (error?.status === 429)
    return 'API rate limit reached. Wait before refreshing, or check your usage in the SharpAPI dashboard.'
  return 'Could not load odds from SharpAPI. Wait 30 seconds and try again, or check status.sharpapi.io.'
}
export function createDemoServer({ sample = false, client } = {}) {
  // Cache both success and failure promises to coalesce concurrent requests and
  // prevent repeated refresh clicks from multiplying upstream quota usage.
  const cache = new Map()
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    )
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const port = server.address()?.port
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`]
    if (
      !hosts.includes(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`) ||
      (req.headers['sec-fetch-site'] &&
        !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))
    ) {
      json(403, { error: 'Open this demo directly using its localhost URL.' })
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      json(405, { error: 'Use GET.' })
      return
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.pathname === '/api/odds') {
        const league = url.searchParams.get('league') || 'mlb'
        if (!LEAGUES.includes(league)) {
          json(400, { error: 'Choose MLB, NFL, NBA or NHL.' })
          return
        }
        let cached = cache.get(league)
        if (!cached || Date.now() - cached.createdAt >= 30000) {
          const promise = (async () => {
            let rows,
              partial = false
            if (sample) rows = sampleOdds(league)
            else {
              if (!client) throw new Error('Missing client')
              const pages = await Promise.all(
                BOOKS.map((sportsbook) =>
                  client.odds.get({
                    sportsbook,
                    league,
                    market: 'moneyline',
                    live: false,
                    limit: 200,
                  }),
                ),
              )
              if (pages.some((page) => !Array.isArray(page.data)))
                throw new Error('Invalid API response')
              rows = pages.flatMap((page) => page.data)
              partial = pages.some(
                (page) =>
                  Boolean(
                    page.pagination?.has_more ||
                      page.meta?.pagination?.has_more,
                  ) || page.data.length >= 200,
              )
            }
            const fetchedAt = new Date().toISOString()
            return {
              mode: sample ? 'sample' : 'api',
              fetchedAt,
              partial,
              events: compareOdds(rows),
            }
          })().then(
            (body) => ({ status: 200, body }),
            (error) => ({ status: 502, body: { error: safeError(error) } }),
          )
          cached = { createdAt: Date.now(), promise }
          cache.set(league, cached)
        }
        const result = await cached.promise
        json(result.status, result.body)
        return
      }
      const asset = assets.get(url.pathname)
      if (!asset) {
        json(404, { error: 'Not found.' })
        return
      }
      const contents = await readFile(
        new URL(`./public/${asset[0]}`, import.meta.url),
      )
      res.writeHead(200, { 'Content-Type': asset[1] })
      res.end(contents)
    } catch {
      json(500, { error: 'The demo could not complete this request.' })
    }
  })
  return server
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const sample = process.argv.includes('--sample')
  const key = process.env.SHARPAPI_API_KEY?.trim()
  if (!sample && !key) {
    console.error(
      'Set SHARPAPI_API_KEY or run npm run demo:sample for synthetic data.',
    )
    process.exitCode = 1
  } else {
    let client
    if (!sample) {
      const { SharpAPI } = await import('../../dist/index.js')
      client = new SharpAPI(key, { timeout: 10000 })
    }
    const port = Number(process.env.PORT || 3000)
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('PORT must be between 1 and 65535.')
    const server = createDemoServer({ sample, client })
    server.on('error', () => {
      console.error(
        'Unable to start demo. Check whether PORT is already in use.',
      )
      process.exitCode = 1
    })
    server.listen(port, '127.0.0.1', () =>
      console.log(
        `SharpAPI odds comparison: http://127.0.0.1:${port} (${sample ? 'synthetic sample data' : 'API data'})`,
      ),
    )
  }
}
