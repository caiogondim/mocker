import https from 'node:https'
import { request as undiciRequest } from 'undici'

const origin = 'https://api-public.usw2.stage.upgrade.com'
const path = '/api/federated-gateway-public/graphql?opname=typename'
const body = JSON.stringify({ query: '{ __typename }' })

const accessToken = process.argv[2]
const deviceToken = process.argv[3]

if (!accessToken || !deviceToken) {
  console.error('Usage: node full-gql-test.mjs <access_token> <device_token>')
  process.exit(1)
}

const headers = {
  'accept': 'application/json',
  'content-type': 'application/json',
  'host': 'api-public.usw2.stage.upgrade.com',
  // 'origin' intentionally omitted to avoid CSRF rejection
  'x-cf-client-id': 'home-improvement-sponsor-ui-web',
  'x-cf-source-id': 'merchant-sponsor-dashboard-ui',
  'cookie': `access_token=${accessToken}; device_token=${deviceToken}`,
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
}

// --- Native https ---
function testNative() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Native Node.js https ===')
    const req = https.request(
      `${origin}${path}`,
      { method: 'POST', headers },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          console.log(`Status: ${res.statusCode}`)
          try {
            const parsed = JSON.parse(data)
            console.log(`Body: ${JSON.stringify(parsed).slice(0, 200)}`)
          } catch {
            console.log(`Body (raw): ${data.slice(0, 200)}`)
          }
          resolve()
        })
      },
    )
    req.on('error', (err) => {
      console.error(`Error: ${err.message}`)
      resolve()
    })
    req.write(body)
    req.end()
  })
}

// --- undici ---
async function testUndici() {
  console.log('\n=== undici ===')
  try {
    const res = await undiciRequest(`${origin}${path}`, {
      method: 'POST',
      headers,
      body,
    })
    console.log(`Status: ${res.statusCode}`)
    const text = await res.body.text()
    try {
      const parsed = JSON.parse(text)
      console.log(`Body: ${JSON.stringify(parsed).slice(0, 200)}`)
    } catch {
      console.log(`Body (raw): ${text.slice(0, 200)}`)
    }
  } catch (err) {
    console.error(`Error: ${err.message}`)
  }
}

await testNative()
await testUndici()
