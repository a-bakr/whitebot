# WhiteBot Project Memory

## Architecture
- Next.js app with tldraw v4 whiteboard, streaming AI tutor (Anthropic claude-sonnet-4-6 primary, OpenAI fallback)
- NDJSON stream protocol: `{"t":"speech"}`, `{"t":"draw","cmd":"..."}`, `{"t":"followup","questions":[]}`
- Speech-draw sync: draws execute via `onPlaying` callback so audio and visuals are locked together
- No camera auto-pan — user controls the viewport manually

## Key Files
- `lib/drawing-types.ts` — 7 draw commands + Rel type + SpeechCommand + FollowupCommand
- `lib/drawing-engine.ts` — DrawingEngine class: simple `Map<id, tldrawId>`, relational placement, resolveEdge, animateText
- `lib/tutor-prompt.ts` — exports `buildSystemPrompt()` — no canvasSnapshot param
- `hooks/useTutor.ts` — main orchestration: stream parsing, TTS prefetch, segment queue, followupQuestions state
- `hooks/useSpeech.ts` — ElevenLabs TTS with OpenAI fallback
- `hooks/useDeepgram.ts` — Deepgram STT WebSocket
- `components/tutor/TutorInterface.tsx` — bottom bar UI
- `app/api/tutor/route.ts` — accepts { messages }, streaming route (no canvasSnapshot)
- `app/page.tsx` — root: wires useTutor → WhiteboardCanvas + TutorInterface

## Drawing Architecture (relational positioning)
- AI uses 7 commands: heading, box, circle, diamond, text, connect, highlight, clear
- Shapes positioned with `rel` + `ref` (right-of, left-of, above, below) OR auto-placed below all content
- No sections, no layout templates, no collision detection
- Engine stores only `Map<semanticId, tldrawId>` — reads live bounds from tldraw for placement
- `connect` reads edge-to-edge coords from live bounds — always emit AFTER both referenced shapes
- `highlight` draws expanding circle-em animation around target shape bounds
- `heading` always auto-places below all existing content (natural section separator)
- Canvas accumulates across topics (never auto-clears)

## Drawing Commands
- `heading` — section title, auto-placed below all content
- `box` — rectangle (240×90), relational or auto
- `circle` — ellipse (130×130), relational or auto
- `diamond` — decision shape (200×110), relational or auto
- `text` — free text annotation, relational or auto
- `connect` — arrow from id→id, reads live bounds
- `highlight` — animated emphasis circle on existing shape
- `clear` — explicit board wipe (user-requested only)

## Color Semantics (enforced in system prompt)
- blue=concept/term · green=result/benefit · red=action/force/danger
- orange=step/process · violet=decision/theory · grey=annotation · yellow=highlight

## Follow-up Questions Feature
- AI emits `{"t":"followup","questions":["Q1?","Q2?","Q3?"]}` at end of every lesson
- useTutor stores in `followupQuestions` state, clears on new message
- TutorInterface shows pill chips above bottom bar (hidden while isActive)
- Clicking a chip sends the question directly

## Deleted Files
- `lib/canvas-state.ts` — removed (CanvasStateManager, section registry, collision detection)
- `lib/layout-templates.ts` — removed (section layout algorithms)

# currentDate
Today's date is 2026-03-04.
