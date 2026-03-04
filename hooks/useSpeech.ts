'use client'

import { useCallback, useRef } from 'react'

export function useSpeech() {
  const queue = useRef<string[]>([])
  const isPlaying = useRef(false)
  const stopped = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  const processQueue = useCallback(async () => {
    isPlaying.current = true
    while (queue.current.length > 0 && !stopped.current) {
      const text = queue.current.shift()!
      try {
        const url = await prefetchTTS(text)
        if (stopped.current) {
          URL.revokeObjectURL(url)
          break
        }
        await playBlobUrl(url, currentAudioRef)
      } catch (err) {
        console.error('[TTS] processQueue failed:', err)
      }
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
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
  }, [])

  const prefetch = useCallback((text: string): Promise<string> => {
    return prefetchTTS(text)
  }, [])

  // onPlaying fires when audio actually starts producing sound (the 'playing' event).
  // durationMs is the actual audio length — use it to pace drawings.
  const playBlob = useCallback(
    (url: string, onPlaying?: (durationMs: number) => void): Promise<void> => {
      return playBlobUrl(url, currentAudioRef, onPlaying)
    },
    [],
  )

  return { speak, stop, prefetch, playBlob }
}

async function prefetchTTS(text: string): Promise<string> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

async function playBlobUrl(
  url: string,
  currentAudioRef: { current: HTMLAudioElement | null },
  onPlaying?: (durationMs: number) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url)
    currentAudioRef.current = audio

    // 'playing' fires when audio is actually producing sound (after buffering).
    // audio.duration is available at this point for blob URLs (fully downloaded).
    audio.addEventListener('playing', () => {
      const durationMs = isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1000
        : 0
      onPlaying?.(durationMs)
    }, { once: true })

    const cleanup = () => {
      URL.revokeObjectURL(url)
      currentAudioRef.current = null
    }

    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      // Still trigger draws so the lesson isn't stuck if TTS fails
      onPlaying?.(0)
      cleanup()
      resolve()
    }
    audio.play().catch(() => {
      onPlaying?.(0)
      cleanup()
      resolve()
    })
  })
}
