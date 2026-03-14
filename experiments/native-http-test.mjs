import https from 'node:https'

const origin = 'https://api-public.usw2.stage.upgrade.com'
const path = '/api/federated-gateway-public/graphql?opname=typename'
const body = JSON.stringify({ query: '{ __typename }' })

console.log(`Connecting to ${origin}${path} via native https...`)

const req = https.request(
  `${origin}${path}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'host': 'api-public.usw2.stage.upgrade.com',
    },
  },
  (res) => {
    console.log(`Status: ${res.statusCode}`)
    let data = ''
    res.on('data', (chunk) => (data += chunk))
    res.on('end', () => console.log(`Body: ${data}`))
  },
)

req.on('error', (err) => {
  console.error(`Error: ${err.message}`)
})

req.write(body)
req.end()
