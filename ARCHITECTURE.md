# WhiteBot — Full Application Architecture

## Overview

WhiteBot is an AI-powered interactive whiteboard tutor. The AI teaches any topic by speaking while simultaneously drawing on a canvas in real time. Users interact via text or voice input.

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.1.6 |
| Language | TypeScript | ^5.9.3 |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS + Shadcn UI | ^3.4.19 |
| Whiteboard | tldraw | ^4.4.0 |
| LLM (primary) | Claude Sonnet 4.6 via `@ai-sdk/anthropic` | ^3.0.53 |
| LLM (fallback) | GPT-5.2 via `@ai-sdk/openai` | ^3.0.39 |
| AI SDK | Vercel AI SDK | ^6.0.108 |
| TTS (primary) | Deepgram Aura (`aura-2-thalia-en`) | REST API |
| TTS (fallback) | OpenAI TTS (`tts-1`) | REST API |
| STT | Deepgram Nova-3 WebSocket | `@deepgram/sdk ^4.11.3` |
| Auth | Supabase Auth + SSR | `@supabase/ssr ^0.9.0` |
| Database | Supabase (Postgres) via Drizzle ORM | `drizzle-orm ^0.45.1` |
| State | React hooks + `@tanstack/react-query` | ^5.90.20 |

---

## Environment Variables

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=...
```

---

## Directory Structure

```
whitebot/
├── app/
│   ├── layout.tsx                        # Root layout — ThemeProvider wrapper
│   ├── page.tsx                          # Landing page — Sign In / Get Started
│   ├── globals.css                       # Global Tailwind CSS
│   ├── dashboard/
│   │   └── page.tsx                      # Main tutor UI — composes whiteboard + interface
│   ├── login/page.tsx                    # Login page
│   ├── signup/page.tsx                   # Signup page
│   ├── forgot-password/
│   │   ├── page.tsx
│   │   ├── reset/page.tsx
│   │   └── success/page.tsx
│   ├── auth/
│   │   ├── actions.ts                    # Server actions for auth
│   │   ├── callback/route.ts             # OAuth callback handler
│   │   ├── auth/confirm/route.ts         # Email confirmation
│   │   └── auth/logout/route.ts          # Logout handler
│   └── api/
│       ├── tutor/route.ts                # Streaming LLM API — primary Anthropic, fallback OpenAI
│       ├── tts/route.ts                  # TTS API — primary Deepgram Aura, fallback OpenAI TTS
│       └── deepgram-token/route.ts       # Issues short-lived Deepgram JWT for browser use
│
├── components/
│   ├── whiteboard/
│   │   └── WhiteboardCanvas.tsx          # tldraw wrapper; exposes DrawingEngine via ref
│   ├── tutor/
│   │   ├── TutorInterface.tsx            # Bottom bar — text input, voice, tool picker, send/stop
│   │   └── VoiceButton.tsx               # Mic toggle button with live transcript display
│   ├── ui/                               # Shadcn UI primitives (button, input, popover, etc.)
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   ├── ForgotPasswordForm.tsx
│   ├── ResetPasswordForm.tsx
│   ├── ProviderSigninBlock.tsx
│   ├── app-bar.tsx
│   ├── footer.tsx
│   ├── mode-toggle.tsx
│   ├── theme-provider.tsx
│   └── QueryProvider.tsx
│
├── hooks/
│   ├── useTutor.ts                       # Main orchestration hook — stream parsing, segment queue, sync
│   ├── useDeepgram.ts                    # Deepgram WebSocket STT — mic → PCM → live transcript
│   └── useSpeech.ts                      # TTS playback — prefetch, queue, play, onPlaying callback
│
├── lib/
│   ├── drawing-engine.ts                 # DrawingEngine class — NDJSON commands → tldraw API calls
│   ├── drawing-types.ts                  # TypeScript types for all draw/speech/followup commands
│   ├── tutor-prompt.ts                   # System prompt builder for the LLM
│   └── utils.ts                          # Tailwind cn() utility
│
└── utils/
    ├── auth/
    │   └── permissions.ts                # Role-based permission helpers
    └── supabase/
    │   ├── client.ts                     # Browser Supabase client
    │   ├── server.ts                     # Server-side Supabase client
    │   └── middleware.ts                 # Auth middleware
    └── db/
        ├── schema.ts                     # Drizzle schema — users table
        ├── db.ts                         # Drizzle DB instance
        ├── db-client.ts                  # DB client helper
        └── migrations/                   # Drizzle SQL migrations
```

---

## Page Routes

| Route | File | Description |
|---|---|---|
| `/` | `app/page.tsx` | Landing page with Sign In / Get Started links |
| `/dashboard` | `app/dashboard/page.tsx` | Full-screen tutor — whiteboard + bottom bar |
| `/login` | `app/login/page.tsx` | Email/password + OAuth login |
| `/signup` | `app/signup/page.tsx` | Registration |
| `/forgot-password` | `app/forgot-password/page.tsx` | Password reset flow |
| `/auth/callback` | `app/auth/callback/route.ts` | Supabase OAuth redirect handler |

---

## API Routes

### `POST /api/tutor`
Streams NDJSON from the LLM.

- **Primary model:** `claude-sonnet-4-6` via `@ai-sdk/anthropic`
- **Fallback model:** `gpt-5.2-2025-12-11` via `@ai-sdk/openai`
- **Input:** `{ messages: Message[] }` — full conversation history
- **Output:** `text/plain` stream of NDJSON lines (one JSON object per line)
- **Max tokens:** 2048
- **Max duration:** 60s (Node.js runtime)

### `POST /api/tts`
Converts text to audio.

- **Primary:** Deepgram Aura REST (`aura-2-thalia-en`) — uses `DEEPGRAM_API_KEY`
- **Fallback:** OpenAI TTS REST (`tts-1`, voice `alloy`) — uses `OPENAI_API_KEY`
- **Input:** `{ text: string }`
- **Output:** `audio/mpeg` stream

### `GET /api/deepgram-token`
Issues a short-lived Deepgram JWT (30s TTL) so the browser never receives the master API key.

- Calls Deepgram `/v1/auth/grant`
- Falls back to returning the master key in dev if the grant endpoint fails
- **Output:** `{ key: string }`

---

## Data Flow — End to End

```
User types or speaks a question
          │
          ▼
  TutorInterface.tsx
  (text input or VoiceButton)
          │
          │  onSend(text)
          ▼
  useTutor.ts — sendMessage()
    • Appends user message to history
    • Cancels previous AbortController
    • POSTs to /api/tutor with full message history
          │
          ▼
  app/api/tutor/route.ts
    • Builds system prompt via buildSystemPrompt()
    • Calls streamText() → Anthropic (fallback: OpenAI)
    • Returns NDJSON text stream
          │
          ▼
  useTutor.ts — stream reader loop
    • Reads chunks, buffers lines
    • Parses each "\n"-terminated line as JSON
    • Routes by command type:
        t === "speech"  → create new Segment
                          prefetch TTS via speech.prefetch()
                          enqueue Segment → start runSegments()
        t === "draw"    → append DrawCommand to currentSegment.draws
                          (or execute immediately if no currentSegment)
        t === "followup"→ setFollowupQuestions()
          │
          ▼
  runSegments() — async executor loop
    • Dequeues one Segment at a time
    • Awaits TTS blob URL (prefetch already in flight)
    • Calls speech.playBlob(blobUrl, onPlaying)
        onPlaying(durationMs) fires when audio starts:
          → calculates draw gap = (durationMs - 500ms) / numDraws
          → executes each DrawCommand with gap delay between them
    • Awaits all draws to finish before next Segment
          │
          ▼
  useSpeech.ts — playBlob()
    • Creates HTMLAudioElement from blob URL
    • Fires onPlaying callback with real audio duration
    • Resolves when audio ends (or on error)
          │
          ▼
  lib/drawing-engine.ts — executeCommand()
    • Dispatches to shape-specific method
    • All shapes animate in (scale-in, typewriter, arrow draw-in)
    • Calls panToLatestShape() to keep content in view
          │
          ▼
  tldraw Editor API — createShapes() / updateShapes()
    • Renders shapes on the whiteboard canvas
```

---

## Voice Input Flow (STT)

```
User clicks VoiceButton
          │
          ▼
  useDeepgram.ts — start()
    • GET /api/deepgram-token → short-lived JWT
    • Opens Deepgram WebSocket (Nova-3, 16kHz, linear16)
    • On WebSocket open:
        • navigator.mediaDevices.getUserMedia({ audio: true })
        • AudioContext at 16kHz
        • AudioWorklet (inline blob) converts Float32 → Int16 PCM
        • Sends PCM buffers to Deepgram WebSocket
    • On is_final transcript → onTranscript(text) → TutorInterface.onSend()
    • Auto-stops mic after final transcript
```

---

## Audio-Drawing Synchronization

Draw commands are paced to finish just as the speech ends:

```
gap = max(250ms, (audioDurationMs - 500ms) / (numDraws - 1))
```

- `onPlaying` fires when the `<audio>` element starts producing sound
- At that moment, `audio.duration` is known (blob is fully downloaded)
- Draws are distributed evenly across the speech duration
- The last draw lands ~500ms before speech ends
- When TTS is unavailable, word count estimates duration at 2.5 words/sec

---

## Drawing Engine

`DrawingEngine` wraps the tldraw `Editor` instance and translates NDJSON commands to tldraw API calls.

### Shape Commands

| Command | tldraw Shape | Animation |
|---|---|---|
| `heading` | `text` (xl, draw font) | Typewriter character-by-character |
| `box` | `geo` rectangle | Scale-in from center (ease-out, 12 frames) |
| `circle` | `geo` ellipse | Scale-in from center |
| `diamond` | `geo` diamond | Scale-in from center |
| `text` | `text` (autoSize) | Typewriter |
| `note` | `note` (sticky) | Typewriter |
| `callout` | `geo` callout | Scale-in from center |
| `emoji` | `text` (xl, sans) | Instant |
| `bullet` | `text` (autoSize) | Typewriter with `• ` or `N. ` prefix |
| `connect` | `arrow` | Draw-in animation (15 frames, ease-in-out) |
| `highlight` | `geo` ellipse | Expand → pulse × 2 → fade out |
| `pan` | — (camera only) | Smooth pan (450ms) |
| `clear` | — | Deletes all shapes, resets registry |

### Positioning

- **Auto:** Shape placed below all existing canvas content (`getNextY()`)
- **Relational (`rel` + `ref`):** Placed relative to a named shape
  - `right-of`, `left-of`, `above`, `below`
  - Gaps: H_GAP = 60px, V_GAP = 50px

### Shape Registry

`DrawingEngine` maintains a `Map<semanticId, { tldrawId }>` to resolve references between shapes (used by `connect`, `highlight`, `pan`).

---

## Authentication & Database

- **Auth:** Supabase Auth (email/password + OAuth)
- **Session handling:** `@supabase/ssr` server client + middleware
- **Database:** Supabase Postgres via Drizzle ORM
- **Schema:** Single `users` table

```typescript
users {
  id:         uuid (PK — mirrors Supabase auth.users UUID)
  name:       text NOT NULL
  email:      text NOT NULL UNIQUE
  role:       text NOT NULL DEFAULT 'user'
  created_at: timestamptz
  updated_at: timestamptz
}
```

---

## NDJSON Protocol — Command Types

```typescript
// Speech — trigger TTS and pace draws against it
{ t: "speech", text: string }

// Draw commands
{ t: "draw", cmd: "clear" }
{ t: "draw", cmd: "heading", id?, text, color? }
{ t: "draw", cmd: "box",     id, label, color?, rel?, ref? }
{ t: "draw", cmd: "circle",  id, label, color?, rel?, ref? }
{ t: "draw", cmd: "diamond", id, label, color?, rel?, ref? }
{ t: "draw", cmd: "text",    id?, text, size?, color?, rel?, ref? }
{ t: "draw", cmd: "note",    id, text, color?, rel?, ref? }
{ t: "draw", cmd: "callout", id, text, color?, rel?, ref? }
{ t: "draw", cmd: "emoji",   id, char, rel?, ref? }
{ t: "draw", cmd: "bullet",  id?, text, index?, color?, rel?, ref? }
{ t: "draw", cmd: "connect", from, to, label?, color?, style? }
{ t: "draw", cmd: "highlight", target, color? }
{ t: "draw", cmd: "pan",     target }

// Follow-up questions shown in UI after response
{ t: "followup", questions: string[] }
```

---

## Component Tree

```
app/layout.tsx (ThemeProvider)
└── app/dashboard/page.tsx (Dashboard)
    ├── WhiteboardCanvas   [ref=whiteboardRef]
    │   └── <Tldraw>       (hideUi, inferDarkMode)
    │       └── DrawingEngine  (created on mount)
    └── TutorInterface
        ├── Popover (drawing tool picker)
        │   └── [hand, select, draw, eraser, text]
        ├── VoiceButton    ← useDeepgram
        └── Input + Send/Stop button
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| NDJSON streaming over SSE/WebSocket | Simple to parse line-by-line; works with any HTTP client |
| Speech-paced drawing | Drawings finish just as speech ends — keeps "teacher drawing" feel |
| TTS prefetch on speech command arrival | Audio is ready before its turn, minimising gaps between segments |
| Short-lived Deepgram token endpoint | Browser never holds master API key |
| Anthropic primary / OpenAI fallback | Resilience if one provider is unavailable |
| Deepgram Aura primary / OpenAI TTS fallback | Same pattern for TTS |
| tldraw `hideUi` + custom bottom bar | Keeps whiteboard clean; custom toolbar fits the tutor UX |
| `clear` guarded by user-intent check | Prevents the AI from wiping the board unintentionally |
| Scale-in / typewriter animations | Makes drawing feel live and handcrafted, not instant |
