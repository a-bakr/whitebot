"use client";

import type { DrawCommand, TutorCommand } from "@/lib/drawing-types";
import { useCallback, useRef, useState } from "react";

import type { DrawingEngine } from "@/lib/drawing-engine";
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
  const [followupQuestions, setFollowupQuestions] = useState<string[]>([]);
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
      setFollowupQuestions([]);

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
            let drawPromise: Promise<unknown> = Promise.resolve();
            let drawStarted = false;
            await speech.playBlob(blobUrl, async (durationMs: number) => {
              if (engine && !drawStarted) {
                drawStarted = true;
                drawPromise = (async () => {
                  const n = seg.draws.length;
                  if (n === 0) return;
                  // Spread draws evenly so last draw lands ~500ms before speech ends.
                  const gap =
                    n > 1 ? Math.max(250, (durationMs - 500) / (n - 1)) : 0;
                  const perCmdBudget =
                    n > 0 && durationMs > 0
                      ? Math.round((durationMs * 0.85) / n)
                      : undefined;
                  for (let i = 0; i < n; i++) {
                    await engine
                      .executeCommand(seg.draws[i], perCmdBudget)
                      .catch(console.error);
                    if (i < n - 1) {
                      await new Promise((r) => setTimeout(r, gap));
                    }
                  }
                })();
              }
            });
            await drawPromise;
          } else {
            if (engine) {
              const n = seg.draws.length;
              // Estimate duration from word count (2.5 words/sec) when no TTS
              const wordCount = seg.speechText.trim().split(/\s+/).length;
              const estimatedMs = Math.max(1000, (wordCount / 2.5) * 1000);
              const gap =
                n > 1 ? Math.max(250, (estimatedMs - 500) / (n - 1)) : 0;
              const perCmdBudget =
                n > 0 ? Math.round((estimatedMs * 0.85) / n) : undefined;
              for (let i = 0; i < n; i++) {
                await engine
                  .executeCommand(seg.draws[i], perCmdBudget)
                  .catch(console.error);
                if (i < n - 1) {
                  await new Promise((r) => setTimeout(r, gap));
                }
              }
            }
          }
        }
        executorRunningRef.current = false;
        setIsActive(false);
      }

      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

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
              continue;
            }

            assistantContent += trimmed + "\n";

            // Safety guard: block unexpected clear commands
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
              if (currentSegment) {
                segmentQueueRef.current.push(currentSegment);
              }
              currentSegment = {
                speechText: cmd.text,
                draws: [],
                ttsPromise: speech.prefetch(cmd.text),
              };
              if (!executorRunningRef.current) {
                runSegments();
              }
            } else if (cmd.t === "draw") {
              if (currentSegment) {
                currentSegment.draws.push(cmd);
              } else {
                // Pre-speech draw (e.g. clear, heading) — execute immediately
                const eng = getEngine();
                if (eng) eng.executeCommand(cmd).catch(console.error);
              }
            } else if (cmd.t === "followup") {
              setFollowupQuestions(cmd.questions ?? []);
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

  return {
    messages,
    isThinking,
    isActive,
    followupQuestions,
    sendMessage,
    stop: stopAll,
  };
}
