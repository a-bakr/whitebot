'use client'

import { useCallback, useRef } from 'react'

export function useSpeech() {
  const queue = useRef<string[]>([])
  const isPlaying = useRef(false)
  const stopped = useRef(false)

  const processQueue = useCallback(async () => {
    isPlaying.current = true
    while (queue.current.length > 0 && !stopped.current) {
      const text = queue.current.shift()!
      await playText(text)
    }
    isPlaying.current = false
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!text?.trim()) return
      stopped.current = false
      queue.current.push(text)
      if (!isPlaying.current) processQueue()
    },
    [processQueue],
  )

  const stop = useCallback(() => {
    stopped.current = true
    queue.current = []
  }, [])

  return { speak, stop }
}

async function playText(text: string): Promise<void> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      audio.play().catch(() => resolve())
    })
  } catch (err) {
    console.error('[TTS] playText failed:', err)
  }
}
