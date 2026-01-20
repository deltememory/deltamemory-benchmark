// Azure OpenAI API client

import { config } from './config.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  temperature?: number
  jsonMode?: boolean
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const { endpoint, apiKey, model, apiVersion } = config.azure
  const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`
  
  const body: any = {
    messages,
    temperature: options.temperature ?? 0.1,
  }
  
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error(`Azure API error (attempt ${attempt}): ${response.status} ${text}`)
        if (attempt < 3) {
          await sleep(1000 * attempt)
          continue
        }
        return ''
      }

      const data = await response.json() as any
      return data.choices?.[0]?.message?.content?.trim() || ''
    } catch (e: any) {
      console.error(`Azure error (attempt ${attempt}): ${e.message}`)
      if (attempt < 3) {
        await sleep(1000 * attempt)
        continue
      }
      return ''
    }
  }
  return ''
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
