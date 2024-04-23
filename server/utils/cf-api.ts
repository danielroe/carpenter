import type { H3Event } from 'h3'

interface CFResponse {
  errors?: unknown[]
  messages?: unknown[]
  result?: {
    response: string
  }
  success: boolean
}

function useAPI (event: H3Event) {
  const config = useRuntimeConfig(event)

  return $fetch.create({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/ai/run`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.cloudflare.apiToken}`
    }
  })
}

export async function sendMessages(event: H3Event, modelId: string, messages: Array<{ role: 'user' | 'system' | 'assistant', content: string }>): Promise<string> {
  return event.context.cloudflare.env?.AI?.run
    ? event.context.cloudflare.env.AI.run(modelId, { messages }).then((r: { response: string }) => r.response)
    : useAPI(event)<CFResponse>(modelId, { body: { messages } }).then(r => r.result?.response)
}
