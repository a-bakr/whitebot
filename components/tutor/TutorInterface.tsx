'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { Send, Square, MousePointer2, Pencil, Eraser, Type, Hand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VoiceButton } from './VoiceButton'
import { useDeepgram } from '@/hooks/useDeepgram'

const TOOLS = [
  { id: 'hand',   icon: Hand,          label: 'Pan'    },
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'draw',   icon: Pencil,        label: 'Draw'   },
  { id: 'eraser', icon: Eraser,        label: 'Erase'  },
  { id: 'text',   icon: Type,          label: 'Text'   },
]

interface TutorInterfaceProps {
  isThinking: boolean
  isActive: boolean
  onSend: (text: string) => void
  onStop: () => void
  activeTool: string
  onSetTool: (toolId: string) => void
}

export function TutorInterface({ isThinking, isActive, onSend, onStop, activeTool, onSetTool }: TutorInterfaceProps) {
  const [input, setInput] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
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
        <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant={toolsOpen ? 'default' : 'ghost'}
              className="h-10 w-10 shrink-0"
              title="Drawing tools"
            >
              {(() => { const t = TOOLS.find(t => t.id === activeTool); return t ? <t.icon className="h-4 w-4" /> : null })()}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-auto p-1.5">
            <div className="flex flex-col items-center gap-1">
              {TOOLS.map(({ id, icon: Icon, label }) => (
                <Button
                  key={id}
                  type="button"
                  size="icon"
                  variant={activeTool === id ? 'default' : 'ghost'}
                  className="h-9 w-9"
                  title={label}
                  onClick={() => { onSetTool(id); setToolsOpen(false) }}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

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
