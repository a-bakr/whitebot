'use client'

import { useCallback, useRef, useState } from 'react'
import type { DrawingEngine } from '@/lib/drawing-engine'
import type { TutorCommand } from '@/lib/drawing-types'
import { useSpeech } from './useSpeech'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function useTutor(getEngine: () => DrawingEngine | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const speech = useSpeech()
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isThinking) return

      const nextMessages: Message[] = [
        ...messages,
        { role: 'user', content: userText },
      ]
      setMessages(nextMessages)
      setIsThinking(true)

      // Stop any ongoing speech
      speech.stop()

      // Cancel any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: nextMessages }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let assistantContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            let cmd: TutorCommand
            try {
              cmd = JSON.parse(trimmed)
            } catch {
              // Skip non-JSON lines (e.g. Vercel AI SDK data prefix characters)
              continue
            }

            assistantContent += trimmed + '\n'

            if (cmd.t === 'speech') {
              speech.speak(cmd.text)
            } else if (cmd.t === 'draw') {
              const engine = getEngine()
              if (engine) {
                engine.executeCommand(cmd).catch(console.error)
              }
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent.trim() },
        ])
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('[useTutor] stream error:', err)
      } finally {
        setIsThinking(false)
      }
    },
    [messages, isThinking, speech, getEngine],
  )

  return { messages, isThinking, sendMessage }
}
