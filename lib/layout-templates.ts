export type LayoutType =
  | 'flow-lr'
  | 'flow-tb'
  | 'tree'
  | 'compare'
  | 'mindmap'
  | 'cycle'
  | 'list'

export interface SlotBounds {
  x: number
  y: number
  w: number
  h: number
}

// Default shape sizes (canvas units)
const SHAPE_SIZE: Record<string, { w: number; h: number }> = {
  rect:    { w: 240, h: 100 },
  circle:  { w: 140, h: 140 },
  diamond: { w: 200, h: 120 },
  text:    { w: 420, h: 36 },
}

const H_GAP  = 60   // horizontal clearance edge-to-edge
const V_GAP  = 50   // vertical clearance edge-to-edge
const PAD    = 60   // canvas left/right padding
const TITLE_H = 80  // space reserved for the section title above content

function sizeFor(shape: string): { w: number; h: number } {
  return SHAPE_SIZE[shape] ?? SHAPE_SIZE.rect
}

/**
 * Compute the bounding box for slot `slotIndex` inside a layout section.
 *
 * @param layout       - which layout template
 * @param slotIndex    - zero-based index of the node being placed
 * @param shape        - shape type ('rect', 'circle', 'diamond', 'text')
 * @param yStart       - the Y coordinate where this section begins
 * @param canvasW      - total canvas width available
 * @param placedSlots  - already-computed slots in this section (for relative layouts)
 * @param totalNodes   - hint: how many nodes will be in this section (0 = unknown, use safe default)
 */
export function computeSlot(
  layout: LayoutType,
  slotIndex: number,
  shape: string,
  yStart: number,
  canvasW: number,
  placedSlots: SlotBounds[],
  totalNodes = 6,
): SlotBounds {
  const sz      = sizeFor(shape)
  const contentY = yStart + TITLE_H
  const usableW  = canvasW - PAD * 2

  switch (layout) {
    // ── Left-to-right flow (centred per row) ─────────────────────────────
    case 'flow-lr': {
      const nodesPerRow = Math.max(1, Math.floor((usableW + H_GAP) / (sz.w + H_GAP)))
      const row = Math.floor(slotIndex / nodesPerRow)
      const col = slotIndex % nodesPerRow

      // Centre the row: when totalNodes is known, compute exact count per row
      const firstInRow = row * nodesPerRow
      const lastInRow  = totalNodes > 0
        ? Math.min((row + 1) * nodesPerRow - 1, totalNodes - 1)
        : firstInRow + nodesPerRow - 1
      const nodesInRow = lastInRow - firstInRow + 1
      const rowWidth   = nodesInRow * sz.w + (nodesInRow - 1) * H_GAP
      const startX     = Math.round(canvasW / 2 - rowWidth / 2)

      return {
        x: startX + col * (sz.w + H_GAP),
        y: contentY + row * (sz.h + V_GAP),
        ...sz,
      }
    }

    // ── Top-to-bottom flow ────────────────────────────────────────────────
    case 'flow-tb': {
      return {
        x: Math.round(canvasW / 2 - sz.w / 2),
        y: contentY + slotIndex * (sz.h + V_GAP),
        ...sz,
      }
    }

    // ── Vertical list (text items) ────────────────────────────────────────
    case 'list': {
      const itemH = shape === 'text' ? 40 : sz.h + 12
      return {
        x: PAD,
        y: contentY + slotIndex * itemH,
        w: usableW,
        h: itemH,
      }
    }

    // ── Two-column comparison ─────────────────────────────────────────────
    case 'compare': {
      const COLS = 2
      const colW = Math.round((usableW - H_GAP * (COLS - 1)) / COLS)
      const col  = slotIndex % COLS
      const row  = Math.floor(slotIndex / COLS)
      return {
        x: PAD + col * (colW + H_GAP),
        y: contentY + row * (sz.h + V_GAP),
        w: colW,
        h: sz.h,
      }
    }

    // ── Mind map (radial) ─────────────────────────────────────────────────
    case 'mindmap': {
      if (slotIndex === 0) {
        // Center node
        return {
          x: Math.round(canvasW / 2 - sz.w / 2),
          y: contentY + 120,
          ...sz,
        }
      }
      // Branch nodes radiate from center
      const center    = placedSlots[0]
      const cx        = (center?.x ?? canvasW / 2 - sz.w / 2) + (center?.w ?? sz.w) / 2
      const cy        = (center?.y ?? contentY + 120) + (center?.h ?? sz.h) / 2
      const RADIUS    = 280
      const branches  = Math.max(1, totalNodes - 1)
      const angle     = ((slotIndex - 1) / branches) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(cx + RADIUS * Math.cos(angle) - sz.w / 2),
        y: Math.round(cy + RADIUS * Math.sin(angle) - sz.h / 2),
        ...sz,
      }
    }

    // ── Cycle (circular ring) ─────────────────────────────────────────────
    case 'cycle': {
      const RADIUS = 220
      const cx     = Math.round(canvasW / 2)
      const cy     = contentY + RADIUS + 20
      const total  = Math.max(3, totalNodes)
      const angle  = (slotIndex / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(cx + RADIUS * Math.cos(angle) - sz.w / 2),
        y: Math.round(cy + RADIUS * Math.sin(angle) - sz.h / 2),
        ...sz,
      }
    }

    // ── Tree (root + branching rows) ──────────────────────────────────────
    case 'tree': {
      if (slotIndex === 0) {
        return {
          x: Math.round(canvasW / 2 - sz.w / 2),
          y: contentY,
          ...sz,
        }
      }
      const COLS   = 3
      const row    = Math.ceil(slotIndex / COLS)
      const col    = (slotIndex - 1) % COLS
      const inRow  = Math.min(COLS, totalNodes - 1)
      const rowW   = inRow * sz.w + (inRow - 1) * H_GAP
      const startX = Math.round(canvasW / 2 - rowW / 2)
      return {
        x: startX + col * (sz.w + H_GAP),
        y: contentY + row * (sz.h + V_GAP + 40),
        ...sz,
      }
    }

    default:
      return {
        x: PAD,
        y: contentY + slotIndex * (sz.h + V_GAP),
        ...sz,
      }
  }
}
