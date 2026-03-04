"use client";

import { useRef, useState } from "react";
import { TutorInterface } from "@/components/tutor/TutorInterface";
import type { WhiteboardRef } from "@/components/whiteboard/WhiteboardCanvas";
import dynamic from "next/dynamic";
import { useTutor } from "@/hooks/useTutor";

const WhiteboardCanvas = dynamic(
  () => import("@/components/whiteboard/WhiteboardCanvas"),
  { ssr: false },
);

export default function Dashboard() {
  const whiteboardRef = useRef<WhiteboardRef>(null);
  const getEngine = () => whiteboardRef.current?.getEngine() ?? null;
  const [activeTool, setActiveTool] = useState("hand");

  const { isThinking, isActive, sendMessage, stop } = useTutor(getEngine);

  const handleSetTool = (toolId: string) => {
    whiteboardRef.current?.setTool(toolId);
    setActiveTool(toolId);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WhiteboardCanvas ref={whiteboardRef} />
      <TutorInterface
        isThinking={isThinking}
        isActive={isActive}
        onSend={sendMessage}
        onStop={stop}
        activeTool={activeTool}
        onSetTool={handleSetTool}
      />
    </main>
  );
}
