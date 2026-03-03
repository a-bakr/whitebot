'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import { TutorInterface } from '@/components/tutor/TutorInterface'
import { useTutor } from '@/hooks/useTutor'
import type { WhiteboardRef } from '@/components/whiteboard/WhiteboardCanvas'

// ssr:false is required — tldraw calls DOM APIs during initialisation and
// crashes the Next.js App Router server pre-render even inside 'use client'.
const WhiteboardCanvas = dynamic(
  () => import('@/components/whiteboard/WhiteboardCanvas'),
  { ssr: false },
)

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
