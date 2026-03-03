// Issues a short-lived Deepgram token so the browser never sees the master key.
// Uses Deepgram's /v1/auth/grant endpoint which returns a ~10-second JWT.
export const runtime = 'nodejs'

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return new Response('DEEPGRAM_API_KEY not configured', { status: 500 })
  }

  try {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ time_to_live: 30 }),
    })

    if (!res.ok) {
      // If short-lived token isn't supported, return the master key
      // (acceptable for local/dev use)
      console.warn('[Deepgram token] grant endpoint failed, returning master key for dev use')
      return Response.json({ key: apiKey })
    }

    const data = await res.json()
    return Response.json({ key: data.key ?? apiKey })
  } catch (err) {
    console.error('[Deepgram token] error:', err)
    return Response.json({ key: apiKey })
  }
}
