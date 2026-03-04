# Audio-Drawing Synchronization Fix Plan

## Problem Statement

The audio (TTS) plays significantly faster than the drawings appear on the whiteboard, creating a poor user experience where the AI has finished speaking before the visual elements are fully drawn.

## Root Cause Analysis

### Current Flow
1. **Stream arrives** → AI sends NDJSON with interleaved `speech` and `draw` commands
2. **TTS prefetch** → When `{"t":"speech","text":"..."}` arrives, audio blob is fetched immediately ([useTutor.ts:182](hooks/useTutor.ts#L182))
3. **Audio plays** → When audio starts playing, the `onPlaying` callback fires ([useTutor.ts:81-93](hooks/useTutor.ts#L81-L93))
4. **Drawings execute** → All draw commands in `seg.draws` execute sequentially as fast as possible
5. **Result** → Drawings finish in 1-2 seconds while speech may take 5-10 seconds

### Key Issues
- No pacing mechanism for drawings
- Draw commands execute at maximum speed (only limited by tldraw API)
- No correlation between speech duration and drawing pace
- Text animation ([drawing-engine.ts:173-180](lib/drawing-engine.ts#L173-L180)) runs at fixed 22ms/char, but other shapes appear instantly

## Proposed Solutions

### Option 1: Simple Delay Between Commands ⭐ FASTEST
**Complexity:** Low
**Effectiveness:** Medium
**Implementation:** Add fixed delay (200-400ms) between each draw command

```typescript
// In useTutor.ts runSegments()
for (const cmd of seg.draws) {
  await engine.executeCommand(cmd).catch(console.error);
  await sleep(300); // Fixed delay
  if (cmd.cmd === 'node' || cmd.cmd === 'note' || cmd.cmd === 'section') {
    engine.panToLatestShape();
  }
}
```

**Pros:**
- Minimal code changes
- Predictable behavior
- Easy to tune

**Cons:**
- Not adaptive to speech length
- May be too slow or too fast depending on content

---

### Option 2: Speech-Duration-Based Pacing ⭐⭐ RECOMMENDED
**Complexity:** Medium
**Effectiveness:** High
**Implementation:** Estimate speech duration from text length and distribute drawings evenly

```typescript
// Estimate speech duration (average: ~150 words/min = 2.5 words/sec)
function estimateSpeechDuration(text: string): number {
  const wordCount = text.trim().split(/\s+/).length;
  const durationMs = (wordCount / 2.5) * 1000;
  return Math.max(durationMs, 1000); // Minimum 1 second
}

// In runSegments()
const estimatedDuration = estimateSpeechDuration(seg.speechText);
const drawDelay = seg.draws.length > 0
  ? estimatedDuration / seg.draws.length
  : 0;

for (const cmd of seg.draws) {
  await engine.executeCommand(cmd).catch(console.error);
  await sleep(drawDelay);
  // ... pan logic
}
```

**Pros:**
- Adaptive to speech length
- Maintains "teaching while drawing" experience
- Drawings finish roughly when speech finishes
- Natural pacing

**Cons:**
- Estimation may be slightly off (depends on TTS speed)
- Requires calculation logic

---

### Option 3: Audio-Completion-First Drawing
**Complexity:** Low
**Effectiveness:** Low
**Implementation:** Wait for audio to finish, then draw all commands

```typescript
// In runSegments()
if (blobUrl) {
  await speech.playBlob(blobUrl); // Wait for audio to finish
  // Then draw everything
  for (const cmd of seg.draws) {
    await engine.executeCommand(cmd).catch(console.error);
  }
}
```

**Pros:**
- Perfect synchronization
- Simple implementation

**Cons:**
- **Loses the "live drawing" experience** - defeats the purpose of an interactive whiteboard tutor
- User sees nothing while audio plays
- Not recommended for this use case

---

### Option 4: Progressive Drawing with Audio Timeline Tracking
**Complexity:** High
**Effectiveness:** Very High
**Implementation:** Track audio playback progress via `audio.currentTime` and trigger drawings at calculated intervals

```typescript
// Requires HTMLAudioElement.currentTime monitoring
// Map draw commands to timeline positions
// Trigger each command when currentTime reaches its position
```

**Pros:**
- Most accurate synchronization
- Professional-quality experience
- Drawings truly sync with speech content

**Cons:**
- Complex implementation
- Requires audio timeline monitoring
- May have browser compatibility concerns
- Overkill for MVP

---

## Recommended Approach: Option 2 (Speech-Duration-Based Pacing)

### Implementation Plan

#### 1. Add speech duration estimator
**File:** `lib/speech-utils.ts` (new file)
```typescript
export function estimateSpeechDuration(text: string): number {
  const wordCount = text.trim().split(/\s+/).length;
  // Deepgram Aura average: ~150 words/min = 2.5 words/sec
  const durationMs = (wordCount / 2.5) * 1000;
  return Math.max(durationMs, 1000); // Minimum 1 second
}
```

#### 2. Update segment execution in useTutor.ts
**Location:** [useTutor.ts:78-106](hooks/useTutor.ts#L78-L106)

**Changes:**
- Import `estimateSpeechDuration`
- Calculate `drawDelay` based on speech duration and draw command count
- Add `sleep(drawDelay)` between draw commands

#### 3. Add configurable tuning parameter
**Environment variable (optional):**
```env
NEXT_PUBLIC_DRAWING_PACE_FACTOR=1.0  # Adjust pacing (0.5 = faster, 2.0 = slower)
```

#### 4. Testing strategy
- Test with short explanations (1-2 sentences)
- Test with long explanations (5+ sentences)
- Test with varying numbers of draw commands (1, 5, 10+)
- Verify panning doesn't interfere with pacing

---

## Alternative: Hybrid Approach (Fallback Option)

Combine Option 1 and Option 2:
- Calculate speech-based delay
- Use minimum of 200ms per command (to prevent too-fast drawing)
- Use maximum of 800ms per command (to prevent too-slow drawing)

```typescript
const baseDuration = estimateSpeechDuration(seg.speechText);
const calculatedDelay = seg.draws.length > 0 ? baseDuration / seg.draws.length : 0;
const drawDelay = Math.max(200, Math.min(800, calculatedDelay));
```

This ensures reasonable pacing even with edge cases.

---

## Files to Modify

1. **lib/speech-utils.ts** (new) - Duration estimation utility
2. **hooks/useTutor.ts** - Segment execution with pacing
3. **CLAUDE.md** (optional) - Update documentation with pacing behavior

---

## Success Metrics

- ✅ Drawings complete within ±20% of speech duration
- ✅ No "finished speaking but still drawing" scenarios
- ✅ Natural, teacher-like pacing
- ✅ Works well with 1-10 draw commands per segment
- ✅ Maintains smooth camera panning

---

## Rollback Plan

If synchronization issues occur:
1. Revert to original code
2. Add simple fixed delay (Option 1) as temporary solution
3. Gather user feedback on preferred pacing
4. Iterate based on real usage data
