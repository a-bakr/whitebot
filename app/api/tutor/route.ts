import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { TUTOR_SYSTEM_PROMPT } from '@/lib/tutor-prompt'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = await streamText({
    model: openai('gpt-4.1'),
    system: TUTOR_SYSTEM_PROMPT,
    messages,
    temperature: 0.7,
    maxOutputTokens: 2048,
  })

  return result.toTextStreamResponse()
}
