import { ElevenLabsClient } from 'elevenlabs'
import { Readable } from 'stream'

// A natural-sounding default voice (Rachel)
const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { text } = await req.json()

  if (!text?.trim()) {
    return new Response('Missing text', { status: 400 })
  }

  // Try ElevenLabs first
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
      const audioStream = await client.textToSpeech.convert(ELEVENLABS_VOICE_ID, {
        text,
        model_id: 'eleven_flash_v2_5',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      })

      const webStream = Readable.toWeb(audioStream) as ReadableStream<Uint8Array>
      return new Response(webStream, {
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    } catch (err) {
      console.error('[TTS] ElevenLabs failed, falling back to OpenAI TTS:', err)
    }
  }

  // Fallback: OpenAI TTS
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
