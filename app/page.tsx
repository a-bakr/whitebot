'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import { TutorInterface } from '@/components/tutor/TutorInterface'
import { useTutor } from '@/hooks/useTutor'
import type { WhiteboardRef } from '@/components/whiteboard/WhiteboardCanvas'

// tldraw must be loaded client-side only (it uses browser APIs)
const WhiteboardCanvas = dynamic(
  () => import('@/components/whiteboard/WhiteboardCanvas'),
  { ssr: false },
)

export default function Home() {
  const whiteboardRef = useRef<WhiteboardRef>(null)
  const getEngine = () => whiteboardRef.current?.getEngine() ?? null

  const { isThinking, sendMessage } = useTutor(getEngine)

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WhiteboardCanvas ref={whiteboardRef} />
      <TutorInterface isThinking={isThinking} onSend={sendMessage} />
    </main>
  )
}
