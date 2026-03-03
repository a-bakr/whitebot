"use client";

import { useCallback, useRef, useState } from "react";
import type { DrawingEngine } from "@/lib/drawing-engine";
import type { DrawCommand, TutorCommand } from "@/lib/drawing-types";
import { useSpeech } from "./useSpeech";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Segment {
  speechText: string;
  draws: DrawCommand[];
  ttsPromise: Promise<string>;
}

export function useTutor(getEngine: () => DrawingEngine | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const speech = useSpeech();
  const abortRef = useRef<AbortController | null>(null);
  const segmentQueueRef = useRef<Segment[]>([]);
  const executorRunningRef = useRef(false);
  const executorStoppedRef = useRef(false);
  const streamDoneRef = useRef(false);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isThinking) return;

      const nextMessages: Message[] = [
        ...messages,
        { role: "user", content: userText },
      ];
      setMessages(nextMessages);
      setIsThinking(true);
      setIsActive(true);

      // Stop any ongoing speech and executor
      speech.stop();
      executorStoppedRef.current = true;
      segmentQueueRef.current = [];

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Reset executor state for new message
      executorStoppedRef.current = false;
      streamDoneRef.current = false;

      async function runSegments() {
        executorRunningRef.current = true;
        setIsActive(true);
        while (!executorStoppedRef.current) {
          if (segmentQueueRef.current.length === 0) {
            if (streamDoneRef.current) break;
            await new Promise((r) => setTimeout(r, 10));
            continue;
          }
          const seg = segmentQueueRef.current.shift()!;
          let blobUrl: string | null = null;
          try {
            blobUrl = await seg.ttsPromise;
          } catch (err) {
            console.error("[useTutor] TTS prefetch failed:", err);
          }
          if (executorStoppedRef.current) {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            break;
          }
          const engine = getEngine();
          if (blobUrl) {
            // drawPromise is assigned inside the onPlaying callback so draws
            // begin exactly when the browser starts producing audio output —
            // not when play() is called (which has 10–100ms buffering delay).
            let drawPromise: Promise<unknown> = Promise.resolve();
            await speech.playBlob(blobUrl, () => {
              if (engine) {
                // Pan camera to show upcoming shapes (skipped if user recently touched camera)
                engine.panToShowDrawCommands(seg.draws);
                drawPromise = Promise.all(
                  seg.draws.map((cmd) =>
                    engine.executeCommand(cmd).catch(console.error),
                  ),
                );
              }
            });
            // Wait for any remaining draw animations (e.g. title typewriter) that
            // outlast the audio clip before moving to the next segment.
            await drawPromise;
          } else {
            if (engine) {
              engine.panToShowDrawCommands(seg.draws);
              await Promise.all(
                seg.draws.map((cmd) =>
                  engine.executeCommand(cmd).catch(console.error),
                ),
              );
            }
          }
        }
        executorRunningRef.current = false;
        setIsActive(false);
      }

      try {
        // Capture canvas context before fetch so AI knows where to draw
        const engine = getEngine();
        const yOffset = engine?.getNextSectionY() ?? 55;
        const viewport = engine?.getViewportBounds() ?? {
          x: 0,
          y: 0,
          w: 1200,
          h: 750,
        };

        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages, yOffset, viewport }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

        // Scroll to the new section before drawing starts
        engine?.scrollToSection(yOffset);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";
        let currentSegment: Segment | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let cmd: TutorCommand;
            try {
              cmd = JSON.parse(trimmed);
            } catch {
              // Skip non-JSON lines (e.g. Vercel AI SDK data prefix characters)
              continue;
            }

            assistantContent += trimmed + "\n";

            // Safety guard: skip unexpected clear commands
            if (cmd.t === "draw" && cmd.cmd === "clear") {
              const lastUserMsg =
                nextMessages
                  .filter((m: Message) => m.role === "user")
                  .at(-1)
                  ?.content?.toLowerCase() ?? "";
              const userWantsClear =
                /\b(clear|erase|start\s*over|wipe|reset)\b/.test(lastUserMsg);
              if (!userWantsClear) {
                console.warn(
                  "[useTutor] Skipping unexpected clear command from AI",
                );
                continue;
              }
            }

            if (cmd.t === "speech") {
              // Finalize previous segment into queue
              if (currentSegment) {
                segmentQueueRef.current.push(currentSegment);
              }
              // Start new segment and immediately kick off TTS fetch
              currentSegment = {
                speechText: cmd.text,
                draws: [],
                ttsPromise: speech.prefetch(cmd.text),
              };
              // Start executor if not already running
              if (!executorRunningRef.current) {
                runSegments();
              }
            } else if (cmd.t === "draw") {
              if (currentSegment) {
                // Accumulate draws for the current segment
                currentSegment.draws.push(cmd);
              } else {
                // Pre-speech draw (e.g. clear) — execute immediately
                const engine = getEngine();
                if (engine) {
                  engine.executeCommand(cmd).catch(console.error);
                }
              }
            }
          }
        }

        // Finalize last segment
        if (currentSegment) {
          segmentQueueRef.current.push(currentSegment);
        }
        streamDoneRef.current = true;
        if (!executorRunningRef.current) {
          runSegments();
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent.trim() },
        ]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setIsActive(false);
          return;
        }
        console.error("[useTutor] stream error:", err);
        streamDoneRef.current = true;
        setIsActive(false);
      } finally {
        setIsThinking(false);
      }
    },
    [messages, isThinking, speech, getEngine],
  );

  const stopAll = useCallback(() => {
    speech.stop();
    executorStoppedRef.current = true;
    segmentQueueRef.current = [];
    abortRef.current?.abort();
    setIsThinking(false);
    setIsActive(false);
  }, [speech]);

  return { messages, isThinking, isActive, sendMessage, stop: stopAll };
}
