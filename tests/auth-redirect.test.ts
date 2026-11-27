import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthMethod, SharpAPI } from '../src/index'

type CapturedRequest = {
  headers: IncomingHttpHeaders
  body: string
  method: string | undefined
}

const originRequests: CapturedRequest[] = []
const destinationRequests: CapturedRequest[] = []
let responseStatus = 200
let origin: Server
let destination: Server
let baseUrl: string
let destinationUrl: string

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing port')
  return `http://127.0.0.1:${address.port}`
}

beforeAll(async () => {
  destination = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    destinationRequests.push({ headers: req.headers, body, method: req.method })
    res.setHeader('Content-Type', 'application/json')
    res.end('{"data":[]}')
  })
  destinationUrl = await listen(destination)
  origin = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    originRequests.push({ headers: req.headers, body, method: req.method })
    if (responseStatus !== 200) {
      res.writeHead(responseStatus, { Location: `${destinationUrl}/capture` })
      res.end()
      return
    }
    res.setHeader('Content-Type', 'application/json')
    res.end('{"data":[]}')
  })
  baseUrl = await listen(origin)
})

afterAll(async () => {
  await Promise.all(
    [origin, destination].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
          server.closeAllConnections()
        }),
    ),
  )
})

describe.each<AuthMethod>([
  'x-api-key',
  'bearer',
])('%s authentication', (authMethod) => {
  it.each([
    301, 302, 303, 307, 308,
  ])('rejects GET and POST redirects with status %i without forwarding credentials or body', async (status) => {
    responseStatus = status
    destinationRequests.length = 0
    const client = new SharpAPI('DUMMY_REDIRECT_TEST_KEY', {
      baseUrl,
      authMethod,
    })
    // Exercise the real native fetch and HTTP redirect handling, not a fetch mock.
    const results = await Promise.allSettled([
      client.sports.list(),
      client.keys.create('private-key-name'),
    ])
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(destinationRequests).toEqual([])
  })

  it('preserves successful authenticated GET and POST requests', async () => {
    responseStatus = 200
    originRequests.length = 0
    destinationRequests.length = 0
    const client = new SharpAPI('DUMMY_REDIRECT_TEST_KEY', {
      baseUrl,
      authMethod,
    })
    expect(await client.sports.list()).toEqual({ data: [] })
    expect(await client.keys.create('private-key-name')).toEqual({ data: [] })
    expect(originRequests).toHaveLength(2)
    for (const request of originRequests) {
      if (authMethod === 'bearer') {
        expect(request.headers.authorization).toBe(
          'Bearer DUMMY_REDIRECT_TEST_KEY',
        )
      } else {
        expect(request.headers['x-api-key']).toBe('DUMMY_REDIRECT_TEST_KEY')
      }
    }
    expect(originRequests[0].method).toBe('GET')
    expect(originRequests[1].method).toBe('POST')
    expect(JSON.parse(originRequests[1].body)).toEqual({
      name: 'private-key-name',
    })
    expect(destinationRequests).toEqual([])
  })
})
