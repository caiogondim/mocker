import { request } from 'undici'

const origin = 'https://api-public.usw2.stage.upgrade.com'
const path = '/api/federated-gateway-public/graphql?opname=typename'

console.log(`Connecting to ${origin}${path} via undici...`)

try {
  const response = await request(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'host': 'api-public.usw2.stage.upgrade.com',
    },
    body: JSON.stringify({ query: '{ __typename }' }),
  })

  console.log(`Status: ${response.statusCode}`)
  console.log(`Headers:`, Object.fromEntries(
    Object.entries(response.headers).filter(([k]) =>
      ['content-type', 'server', 'set-cookie'].includes(k)
    )
  ))

  const body = await response.body.text()
  console.log(`Body: ${body}`)
} catch (error) {
  console.error(`Error: ${error.message}`)
  console.error(error)
}
