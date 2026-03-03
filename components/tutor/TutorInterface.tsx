'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VoiceButton } from './VoiceButton'
import { useDeepgram } from '@/hooks/useDeepgram'

interface TutorInterfaceProps {
  isThinking: boolean
  isActive: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export function TutorInterface({ isThinking, isActive, onSend, onStop }: TutorInterfaceProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleTranscript = (text: string) => {
    onSend(text)
  }

  const { isListening, liveText, start, stop } = useDeepgram(handleTranscript)

  const submit = () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    onSend(text)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center gap-3 px-4">
        <VoiceButton
          isListening={isListening}
          isThinking={isThinking}
          liveText={liveText}
          onStart={start}
          onStop={stop}
        />

        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isThinking ? 'Teaching...' : 'Ask me anything...'}
          disabled={isThinking || isListening}
          className="flex-1 h-10"
          autoComplete="off"
        />

        {isActive ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="h-10 w-10 shrink-0"
            onClick={onStop}
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={submit}
            disabled={!input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
