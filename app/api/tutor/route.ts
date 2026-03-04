import { buildSystemPrompt } from '@/lib/tutor-prompt'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 60

function textDeltaStream(result: Awaited<ReturnType<typeof streamText>>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.textStream) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  const { messages } = await req.json()
  const system = buildSystemPrompt()

  try {
    const result = await streamText({
      model: anthropic('claude-sonnet-4-6'),
      system,
      maxOutputTokens: 2048,
      messages,
    })
    return textDeltaStream(result)
  } catch (err) {
    console.warn('[tutor] Anthropic failed, falling back to OpenAI:', err)
    const result = await streamText({
      model: openai('gpt-5.2-2025-12-11'),
      system,
      maxOutputTokens: 2048,
      messages,
    })
    return textDeltaStream(result)
  }
}
