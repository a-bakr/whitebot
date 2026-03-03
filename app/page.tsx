'use client'

import { useRef } from 'react'
import WhiteboardCanvas from '@/components/whiteboard/WhiteboardCanvas'
import { TutorInterface } from '@/components/tutor/TutorInterface'
import { useTutor } from '@/hooks/useTutor'
import type { WhiteboardRef } from '@/components/whiteboard/WhiteboardCanvas'

export default function Home() {
  const whiteboardRef = useRef<WhiteboardRef>(null)
  const getEngine = () => whiteboardRef.current?.getEngine() ?? null

  const { isThinking, isActive, sendMessage, stop } = useTutor(getEngine)

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WhiteboardCanvas ref={whiteboardRef} />
      <TutorInterface
        isThinking={isThinking}
        isActive={isActive}
        onSend={sendMessage}
        onStop={stop}
      />
    </main>
  )
}
