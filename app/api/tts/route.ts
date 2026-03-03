export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { text } = await req.json()

  if (!text?.trim()) {
    return new Response('Missing text', { status: 400 })
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'alloy',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('[TTS] OpenAI TTS failed:', err)
    return new Response('TTS failed', { status: 502 })
  }

  return new Response(response.body, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
