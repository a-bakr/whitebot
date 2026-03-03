# Project: WhiteBot — AI Whiteboard Tutor

## Development Commands

- Run development server: `npm run dev` (or `pnpm dev`)
- Build project: `npm run build` (or `pnpm build`)
- Run linting: `npm run lint` (or `pnpm lint`)
- Run type checking: `npm run type-check` (or `pnpm type-check`)

## Project Structure

- Components: `/components/ui/` - Shadcn UI components
- Main app files: Standard Next.js structure

## Notes

- This is a Shadcn UI application
- Uses Tailwind CSS for styling
- Built with Next.js/React

---

## Product Vision

An interactive AI tutor that teaches any topic by drawing on a whiteboard in real-time — like a teacher in a classroom. The AI speaks while drawing, and users interact via text or voice.

---

## Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| **Whiteboard** | tldraw v4 | First-class AI agent kit, `editor.createShapes()` programmatic API |
| **LLM** | GPT-4.1 via Vercel AI SDK v6 | Streaming support, `@ai-sdk/openai` |
| **TTS** | ElevenLabs WebSocket (fallback: OpenAI TTS) | ~135ms latency, natural voice; OpenAI TTS as fallback if ElevenLabs unavailable |
| **STT** | Deepgram Nova-3 WebSocket | All browsers, <300ms latency, production-grade |
| **Drawing Protocol** | NDJSON (newline-delimited JSON) | Parse line-by-line as stream arrives |

> Note: OpenAI Whisper is STT (speech-to-text), not TTS. The TTS fallback is OpenAI TTS (`tts-1` / `tts-1-hd`).

## UI Layout

Full whiteboard (fills viewport) + slim fixed bottom bar:

```
+------------------------------------------+
|              tldraw Canvas               |
|         (AI draws here live)             |
+------------------------------------------+
| [🎤 Voice] [Ask anything...     ] [➤]   |
+------------------------------------------+
```

## Drawing Command Protocol (NDJSON)

The AI emits one JSON object per line, interleaved speech + draw commands:

```json
{"t":"speech","text":"Let me show you Newton's first law."}
{"t":"draw","cmd":"clear"}
{"t":"draw","cmd":"title","text":"Newton's First Law","x":400,"y":50}
{"t":"draw","cmd":"rect","x":100,"y":200,"w":180,"h":80,"label":"Object at Rest","color":"blue"}
{"t":"draw","cmd":"arrow","x1":280,"y1":240,"x2":480,"y2":240,"label":"Force Applied"}
{"t":"draw","cmd":"rect","x":480,"y":200,"w":180,"h":80,"label":"Moving Object","color":"green"}
```

### Available Drawing Commands

- `clear` — clear the board
- `title` — large heading text (x, y, text, color?)
- `text` — body text (x, y, text, color?, size?)
- `rect` — rectangle (x, y, w, h, label?, color?)
- `circle` — circle (x, y, r, label?, color?)
- `arrow` — arrow (x1, y1, x2, y2, label?, color?)
- `line` — straight line (x1, y1, x2, y2, color?)
- `bullet` — bulleted list item (x, y, text, index)
- `highlight` — highlight box overlay (x, y, w, h, color?)

## Files to Create

```
app/
  page.tsx                        # MODIFY: Replace starter page with tutor UI
  api/
    tutor/route.ts                # NEW: Streaming GPT-4.1 API route
    deepgram-token/route.ts       # NEW: Issue temporary Deepgram tokens
components/
  whiteboard/WhiteboardCanvas.tsx # NEW: tldraw wrapper + drawing engine
  tutor/TutorInterface.tsx        # NEW: Bottom bar (text input + voice)
  tutor/VoiceButton.tsx           # NEW: Deepgram mic input component
hooks/
  useTutor.ts                     # NEW: Main orchestration hook
  useDeepgram.ts                  # NEW: Deepgram WebSocket STT
  useSpeech.ts                    # NEW: ElevenLabs TTS (with OpenAI TTS fallback)
lib/
  drawing-engine.ts               # NEW: NDJSON command → tldraw API calls
  drawing-types.ts                # NEW: TypeScript types for draw commands
  tutor-prompt.ts                 # NEW: System prompt for GPT-4.1
```

## Required Environment Variables

```
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...
```

## Stream Parsing Logic

```
Read stream chunk
  → Buffer incomplete lines
  → For each complete "\n"-terminated line:
      if t === "speech" → add sentence to TTS queue (ElevenLabs → OpenAI TTS fallback)
      if t === "draw"   → call drawingEngine.executeCommand(cmd)
```

## System Prompt Key Points for GPT-4.1

- Act as an enthusiastic whiteboard teacher
- Output ONLY valid NDJSON (one JSON object per line, no other text)
- Interleave `speech` and `draw` — never dump all drawing at the end
- Build diagrams progressively, concept by concept
- Keep coordinates in range: x: 50–1150, y: 50–750

## Install Command

```bash
pnpm add tldraw ai @ai-sdk/openai @deepgram/sdk elevenlabs
```
