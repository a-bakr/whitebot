'use client'

import { Mic, MicOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VoiceButtonProps {
  isListening: boolean
  isThinking: boolean
  liveText: string
  onStart: () => void
  onStop: () => void
}

export function VoiceButton({ isListening, isThinking, liveText, onStart, onStop }: VoiceButtonProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isListening ? 'destructive' : 'outline'}
        size="icon"
        className={cn(
          'h-10 w-10 shrink-0 transition-all',
          isListening && 'animate-pulse',
        )}
        onClick={isListening ? onStop : onStart}
        disabled={isThinking}
        title={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isThinking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>

      {isListening && liveText && (
        <span className="text-sm text-muted-foreground italic truncate max-w-[200px]">
          {liveText}
        </span>
      )}
    </div>
  )
}
