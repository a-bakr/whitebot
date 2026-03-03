export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { text } = await req.json()

  if (!text?.trim()) {
    return new Response('Missing text', { status: 400 })
  }

  // Primary: Deepgram Aura TTS
  if (process.env.DEEPGRAM_API_KEY) {
    try {
      const dgRes = await fetch(
        'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        },
      )
      if (dgRes.ok) {
        return new Response(dgRes.body, {
          headers: { 'Content-Type': 'audio/mpeg' },
        })
      }
      const err = await dgRes.text()
      console.warn('[TTS] Deepgram failed, falling back to OpenAI:', err)
    } catch (err) {
      console.warn('[TTS] Deepgram error, falling back to OpenAI:', err)
    }
  }

  // Fallback: OpenAI TTS
  const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
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

  if (!openaiRes.ok) {
    const err = await openaiRes.text()
    console.error('[TTS] OpenAI TTS failed:', err)
    return new Response('TTS failed', { status: 502 })
  }

  return new Response(openaiRes.body, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
