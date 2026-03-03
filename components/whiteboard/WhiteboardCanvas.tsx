"use client";

import { Editor, Tldraw } from "tldraw";
import { forwardRef, useImperativeHandle, useRef } from "react";

import { DrawingEngine } from "@/lib/drawing-engine";

export interface WhiteboardRef {
  getEngine: () => DrawingEngine | null;
}

const WhiteboardCanvas = forwardRef<WhiteboardRef>((_, ref) => {
  const engineRef = useRef<DrawingEngine | null>(null);

  useImperativeHandle(ref, () => ({
    getEngine: () => engineRef.current,
  }));

  function handleMount(editor: Editor) {
    engineRef.current = new DrawingEngine(editor);

    // Whiteboard defaults: white background, dark pen
    editor.updateInstanceState({ isDebugMode: false });

    // Set the default pen color to black
    editor.setStyleForNextShapes(
      { id: "tldraw:color", type: "tldraw:color" } as never,
      "black",
    );

    // Zoom to fit the canvas area
    editor.zoomToFit();
    editor.updateInstanceState({ isDebugMode: false });
    editor.zoomToFit();
  }

  return (
    <div className="absolute inset-0 bottom-16">
      <Tldraw
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        onMount={handleMount}
        inferDarkMode
        hideUi
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
});

WhiteboardCanvas.displayName = "WhiteboardCanvas";

export default WhiteboardCanvas;
