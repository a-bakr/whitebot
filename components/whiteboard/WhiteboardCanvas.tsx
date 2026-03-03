'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { DrawingEngine } from '@/lib/drawing-engine'

export interface WhiteboardRef {
  getEngine: () => DrawingEngine | null
}

const WhiteboardCanvas = forwardRef<WhiteboardRef>((_, ref) => {
  const engineRef = useRef<DrawingEngine | null>(null)

  useImperativeHandle(ref, () => ({
    getEngine: () => engineRef.current,
  }))

  function handleMount(editor: Editor) {
    engineRef.current = new DrawingEngine(editor)

    editor.updateInstanceState({ isDebugMode: false })
    editor.zoomToFit()
  }

  return (
    <div className="absolute inset-0 bottom-16">
      <Tldraw
        onMount={handleMount}
        inferDarkMode
        hideUi
      />
    </div>
  )
})

WhiteboardCanvas.displayName = 'WhiteboardCanvas'

export default WhiteboardCanvas
