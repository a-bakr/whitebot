"use client";

import { Editor, Tldraw } from "tldraw";
import { forwardRef, useImperativeHandle, useRef } from "react";

import { DrawingEngine } from "@/lib/drawing-engine";

export interface WhiteboardRef {
  getEngine: () => DrawingEngine | null;
  setTool: (toolId: string) => void;
}

const WhiteboardCanvas = forwardRef<WhiteboardRef>((_, ref) => {
  const engineRef = useRef<DrawingEngine | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useImperativeHandle(ref, () => ({
    getEngine: () => engineRef.current,
    setTool: (toolId: string) => editorRef.current?.setCurrentTool(toolId),
  }));

  function handleMount(editor: Editor) {
    editorRef.current = editor;
    engineRef.current = new DrawingEngine(editor);

    // Whiteboard defaults: white background, dark pen
    editor.updateInstanceState({ isDebugMode: false });

    // Set the default pen color to black
    editor.setStyleForNextShapes(
      { id: "tldraw:color", type: "tldraw:color" } as never,
      "black",
    );

    // Scroll wheel zooms; middle-click-drag pans (built-in)
    editor.setCameraOptions({ wheelBehavior: "zoom" });

    // Default tool: select
    editor.setCurrentTool("select");

    // Zoom to fit the canvas area
    editor.zoomToFit();
    editor.updateInstanceState({ isDebugMode: false });
    editor.zoomToFit();
  }

  return (
    <div className="absolute inset-0 bottom-16">
      <Tldraw
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
