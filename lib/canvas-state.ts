import { Box, Editor, TLShapeId } from 'tldraw'
import { computeSlot, type LayoutType, type SlotBounds } from './layout-templates'

export interface ShapeRecord {
  semanticId: string
  tldrawId:   TLShapeId
  sectionId:  string
  label?:     string
  color?:     string
  shape?:     string  // 'rect' | 'circle' | 'diamond' | 'text' | …
}

export interface SectionRecord {
  id:         string
  layout:     LayoutType
  title:      string
  yStart:     number
  nodeIds:    string[]   // semantic IDs in insertion order
  nodeCount:  number     // = nodeIds.length, cached for convenience
  maxNodes:   number     // hint for cycle / mindmap (default 6)
}

export class CanvasStateManager {
  private shapes   = new Map<string, ShapeRecord>()
  private sections = new Map<string, SectionRecord>()
  private _autoN   = 0

  constructor(private editor: Editor) {}

  // ── Auto-ID ─────────────────────────────────────────────────────────────

  nextAutoId(): string {
    return `_a${++this._autoN}`
  }

  // ── Shape registration ───────────────────────────────────────────────────

  register(
    semanticId: string,
    tldrawId:   TLShapeId,
    sectionId = '',
    meta?: { label?: string; color?: string; shape?: string },
  ): void {
    this.shapes.set(semanticId, {
      semanticId,
      tldrawId,
      sectionId,
      label: meta?.label,
      color: meta?.color,
      shape: meta?.shape,
    })
    const section = this.sections.get(sectionId)
    if (section && !section.nodeIds.includes(semanticId)) {
      section.nodeIds.push(semanticId)
      section.nodeCount = section.nodeIds.length
    }
  }

  getShape(semanticId: string): ShapeRecord | null {
    return this.shapes.get(semanticId) ?? null
  }

  /** Reads fresh bounds from tldraw — never stale. */
  getBounds(semanticId: string): { x: number; y: number; w: number; h: number } | null {
    const rec = this.shapes.get(semanticId)
    if (!rec) return null
    const b = this.editor.getShapePageBounds(rec.tldrawId)
    if (!b) return null
    return { x: b.x, y: b.y, w: b.w, h: b.h }
  }

  // ── Section management ───────────────────────────────────────────────────

  startSection(id: string, layout: LayoutType, title: string, maxNodes = 6): SectionRecord {
    const yStart = this.getNextSectionY()
    const record: SectionRecord = {
      id, layout, title, yStart, nodeIds: [], nodeCount: 0, maxNodes,
    }
    this.sections.set(id, record)
    return record
  }

  getSection(id: string): SectionRecord | null {
    return this.sections.get(id) ?? null
  }

  // ── Node placement ───────────────────────────────────────────────────────

  /**
   * Compute where to place the next node in a section, using the layout template.
   * Returns the slot bounds in page-space coordinates.
   */
  computeNodeBounds(sectionId: string, shape: string): SlotBounds {
    const section = this.sections.get(sectionId)
    if (!section) {
      // Fallback: stack below existing content
      return { x: 60, y: this.getNextSectionY(), w: 240, h: 100 }
    }

    // Collect bounds of already-placed nodes in this section
    const placedSlots: SlotBounds[] = section.nodeIds
      .map(id => this.getBounds(id))
      .filter((b): b is NonNullable<typeof b> => b !== null)

    const vp     = this.editor.getViewportPageBounds()
    const canvasW = Math.round(vp.w)

    return computeSlot(
      section.layout,
      section.nodeCount,
      shape,
      section.yStart,
      canvasW,
      placedSlots,
      section.maxNodes,
    )
  }

  // ── Geometry helpers ─────────────────────────────────────────────────────

  getNextSectionY(): number {
    const bounds = this.editor.getCurrentPageBounds()
    if (!bounds) return 55
    return Math.ceil(bounds.maxY) + 100
  }

  /**
   * Find a free rect near `preferred` using tldraw's spatial index.
   * Nudges right, then stacks below, until no collision is found.
   * Returns `preferred` unchanged if the area is already clear.
   */
  findFreeRect(
    preferred: { x: number; y: number; w: number; h: number },
    padding = 24,
  ): { x: number; y: number; w: number; h: number } {
    const MAX_ATTEMPTS = 8
    let candidate = { ...preferred }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const hits = this.editor.getShapeIdsInsideBounds(
        new Box(
          candidate.x - padding,
          candidate.y - padding,
          candidate.w + padding * 2,
          candidate.h + padding * 2,
        ),
      )
      if (hits.size === 0) return candidate

      // Union of all colliding shapes → push past their right/bottom edge
      let maxX = candidate.x + candidate.w
      let maxY = candidate.y + candidate.h
      for (const id of hits) {
        const b = this.editor.getShapePageBounds(id)
        if (!b) continue
        maxX = Math.max(maxX, b.x + b.w)
        maxY = Math.max(maxY, b.y + b.h)
      }

      const rightX = maxX + padding
      if (rightX + candidate.w <= 1500) {
        candidate = { ...candidate, x: rightX }
      } else {
        // Would go off-canvas — stack below everything instead
        const page = this.editor.getCurrentPageBounds()
        candidate = {
          ...preferred,
          y: (page ? Math.ceil(page.maxY) : candidate.y) + padding + 20,
        }
      }
    }

    // Hard fallback
    const page = this.editor.getCurrentPageBounds()
    return {
      ...preferred,
      y: (page ? Math.ceil(page.maxY) : preferred.y) + padding + 20,
    }
  }

  // ── Edge resolution ──────────────────────────────────────────────────────

  /**
   * Compute edge-to-edge arrow coordinates between two semantic shape IDs.
   * Reads actual tldraw bounds — never guesses.
   * Returns null if either shape hasn't been placed yet.
   */
  resolveEdge(
    fromId: string,
    toId:   string,
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const fromRec = this.shapes.get(fromId)
    const toRec   = this.shapes.get(toId)
    if (!fromRec || !toRec) return null

    const fromB = this.editor.getShapePageBounds(fromRec.tldrawId)
    const toB   = this.editor.getShapePageBounds(toRec.tldrawId)
    if (!fromB || !toB) return null

    const fromCX = fromB.x + fromB.w / 2
    const fromCY = fromB.y + fromB.h / 2
    const toCX   = toB.x + toB.w / 2
    const toCY   = toB.y + toB.h / 2

    const dx = toCX - fromCX
    const dy = toCY - fromCY

    let x1: number, y1: number, x2: number, y2: number

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal connection: right-edge → left-edge (or reversed)
      if (dx >= 0) {
        x1 = Math.round(fromB.x + fromB.w); y1 = Math.round(fromCY)
        x2 = Math.round(toB.x);             y2 = Math.round(toCY)
      } else {
        x1 = Math.round(fromB.x);           y1 = Math.round(fromCY)
        x2 = Math.round(toB.x + toB.w);     y2 = Math.round(toCY)
      }
    } else {
      // Vertical connection: bottom-edge → top-edge (or reversed)
      if (dy >= 0) {
        x1 = Math.round(fromCX); y1 = Math.round(fromB.y + fromB.h)
        x2 = Math.round(toCX);   y2 = Math.round(toB.y)
      } else {
        x1 = Math.round(fromCX); y1 = Math.round(fromB.y)
        x2 = Math.round(toCX);   y2 = Math.round(toB.y + toB.h)
      }
    }

    return { x1, y1, x2, y2 }
  }

  // ── Note anchoring ───────────────────────────────────────────────────────

  /**
   * Return a position for a text annotation anchored to a semantic shape.
   * Always places outside the shape bounds with a comfortable gap.
   */
  resolveNote(
    anchorId: string,
    pos: 'above' | 'below' | 'left' | 'right' | 'inside',
  ): { x: number; y: number } | null {
    const rec = this.shapes.get(anchorId)
    if (!rec) return null
    const b = this.editor.getShapePageBounds(rec.tldrawId)
    if (!b) return null

    const GAP = 44
    switch (pos) {
      case 'below':  return { x: Math.round(b.x),             y: Math.round(b.y + b.h + GAP) }
      case 'above':  return { x: Math.round(b.x),             y: Math.round(b.y - GAP - 30) }
      case 'left':   return { x: Math.round(b.x - 360 - GAP), y: Math.round(b.y + b.h / 2 - 15) }
      case 'right':  return { x: Math.round(b.x + b.w + GAP), y: Math.round(b.y + b.h / 2 - 15) }
      case 'inside': return { x: Math.round(b.x + 10),        y: Math.round(b.y + 10) }
    }
  }

  // ── Canvas snapshot ──────────────────────────────────────────────────────

  /**
   * Serialise the current canvas state as a compact text block
   * suitable for injecting into the AI system prompt.
   */
  toSnapshot(): string {
    const page  = this.editor.getCurrentPageBounds()
    const nextY = page ? Math.ceil(page.maxY) + 100 : 55

    if (this.sections.size === 0 && this.shapes.size === 0) {
      return `CANVAS: empty\nnext_section_y: ${nextY}`
    }

    const lines: string[] = ['CANVAS:']

    for (const sec of this.sections.values()) {
      lines.push(`section "${sec.id}" [${sec.layout}] "${sec.title}"`)
      if (sec.nodeIds.length > 0) {
        const nodeDescs = sec.nodeIds.map(id => {
          const rec = this.shapes.get(id)
          if (!rec) return id
          const parts = [id]
          if (rec.label) parts.push(rec.label)
          if (rec.color) parts.push(rec.color)
          if (rec.shape) parts.push(rec.shape)
          return parts.join(':')
        }).join(', ')
        lines.push(`  nodes: ${nodeDescs}`)
      }
    }

    lines.push(`next_section_y: ${nextY}`)
    return lines.join('\n')
  }
}
