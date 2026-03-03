import { createShapeId, Editor, TLShapeId, toRichText } from 'tldraw'
import type {
  DrawCommand,
  DrawColor,
  DrawSize,
  TitleCommand,
  TextCommand,
  RectCommand,
  CircleCommand,
  ArrowCommand,
  LineCommand,
  BulletCommand,
  HighlightCommand,
  UnderlineCommand,
  CircleEmCommand,
  SketchArrowCommand,
} from './drawing-types'

const COLOR_MAP: Record<string, DrawColor> = {
  blue: 'blue',
  red: 'red',
  green: 'green',
  orange: 'orange',
  yellow: 'yellow',
  violet: 'violet',
  black: 'black',
  grey: 'grey',
  gray: 'grey',
  white: 'white',
  'light-blue': 'light-blue',
  'light-green': 'light-green',
  'light-red': 'light-red',
  'light-violet': 'light-violet',
}

function toTlColor(color?: string): DrawColor {
  if (!color) return 'black'
  return COLOR_MAP[color.toLowerCase()] ?? 'black'
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function getCommandBounds(
  cmd: DrawCommand,
): { x: number; y: number; w: number; h: number } | null {
  switch (cmd.cmd) {
    case 'title':
      return { x: cmd.x, y: cmd.y, w: 400, h: 70 }
    case 'text':
      return { x: cmd.x, y: cmd.y, w: 350, h: 40 }
    case 'rect':
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h }
    case 'circle':
      return { x: cmd.x - cmd.r, y: cmd.y - cmd.r, w: cmd.r * 2, h: cmd.r * 2 }
    case 'arrow':
    case 'sketch-arrow': {
      const x = Math.min(cmd.x1, cmd.x2)
      const y = Math.min(cmd.y1, cmd.y2)
      return { x, y, w: Math.max(Math.abs(cmd.x2 - cmd.x1), 20), h: Math.max(Math.abs(cmd.y2 - cmd.y1), 20) }
    }
    case 'line': {
      const x = Math.min(cmd.x1, cmd.x2)
      const y = Math.min(cmd.y1, cmd.y2)
      return { x, y, w: Math.max(Math.abs(cmd.x2 - cmd.x1), 20), h: Math.max(Math.abs(cmd.y2 - cmd.y1), 20) }
    }
    case 'bullet':
      return { x: cmd.x, y: cmd.y + cmd.index * 40, w: 400, h: 40 }
    case 'highlight':
    case 'circle-em':
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h }
    case 'underline': {
      const x = Math.min(cmd.x1, cmd.x2)
      const y = Math.min(cmd.y1, cmd.y2)
      return { x, y, w: Math.max(Math.abs(cmd.x2 - cmd.x1), 20), h: 10 }
    }
    default:
      return null
  }
}

export class DrawingEngine {
  private _lastUserInteraction = 0

  constructor(private editor: Editor) {
    this._subscribeToUserInteraction()
  }

  private _subscribeToUserInteraction() {
    const update = () => {
      this._lastUserInteraction = Date.now()
    }
    const el = this.editor.getContainer()
    el.addEventListener('pointerdown', update, { passive: true })
    el.addEventListener('wheel', update, { passive: true })
  }

  async executeCommand(cmd: DrawCommand) {
    switch (cmd.cmd) {
      case 'clear':
        this.clear()
        break
      case 'title':
        await this.drawTitle(cmd)
        break
      case 'text':
        await this.drawText(cmd)
        break
      case 'rect':
        this.drawRect(cmd)
        break
      case 'circle':
        this.drawCircle(cmd)
        break
      case 'arrow':
        this.drawArrow(cmd)
        break
      case 'line':
        this.drawLine(cmd)
        break
      case 'bullet':
        await this.drawBullet(cmd)
        break
      case 'highlight':
        this.drawHighlight(cmd)
        break
      case 'underline':
        await this.drawUnderline(cmd)
        break
      case 'circle-em':
        await this.drawCircleEm(cmd)
        break
      case 'sketch-arrow':
        this.drawSketchArrow(cmd)
        break
    }
  }

  clear() {
    const ids = [...this.editor.getCurrentPageShapeIds()]
    if (ids.length > 0) this.editor.deleteShapes(ids)
  }

  getNextSectionY(): number {
    const bounds = this.editor.getCurrentPageBounds()
    if (!bounds) return 55
    return Math.ceil(bounds.maxY) + 100
  }

  getViewportBounds(): { x: number; y: number; w: number; h: number } {
    const vp = this.editor.getViewportPageBounds()
    return { x: Math.round(vp.x), y: Math.round(vp.y), w: Math.round(vp.w), h: Math.round(vp.h) }
  }

  scrollToSection(y: number): void {
    const vp = this.editor.getViewportPageBounds()
    this.editor.centerOnPoint(
      { x: vp.x + vp.w / 2, y: y + vp.h * 0.35 },
      { animation: { duration: 400 } },
    )
  }

  panToShowDrawCommands(cmds: DrawCommand[]): void {
    // Layer 2: don't fight the user if they've recently touched the camera
    if (Date.now() - this._lastUserInteraction < 2000) return

    // Compute union bounding box of all shapes in this segment
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const cmd of cmds) {
      const b = getCommandBounds(cmd)
      if (!b) continue
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
    if (minX === Infinity) return

    const vp = this.editor.getViewportPageBounds()
    const MARGIN = 80

    // Layer 1: only pan when shapes are outside or too close to the edge
    const fullyVisible =
      minX >= vp.x + MARGIN &&
      maxX <= vp.x + vp.w - MARGIN &&
      minY >= vp.y + MARGIN &&
      maxY <= vp.y + vp.h - MARGIN
    if (fullyVisible) return

    // Position shapes at ~35% from the top so there's room to grow downward.
    // centerOnPoint(y) sets the page-y at the viewport centre.
    // We want minY at 35% from top → centerY = minY + vp.h * 0.15
    const shapeCX = (minX + maxX) / 2
    const targetCY = minY + vp.h * 0.15

    this.editor.centerOnPoint(
      { x: shapeCX, y: targetCY },
      { animation: { duration: 400 } },
    )
  }

  private async animateRichText(id: TLShapeId, fullText: string) {
    let current = ''
    for (const char of fullText) {
      current += char
      this.editor.updateShapes([
        {
          id,
          type: 'text',
          props: { richText: toRichText(current) },
        },
      ])
      await sleep(22)
    }
  }

  private async drawTitle(cmd: TitleCommand) {
    const id = createShapeId()
    this.editor.createShapes([
      {
        id,
        type: 'text',
        x: cmd.x,
        y: cmd.y,
        props: {
          richText: toRichText(''),
          size: 'xl' as DrawSize,
          color: toTlColor(cmd.color),
          font: 'draw',
          textAlign: 'middle',
          autoSize: true,
        },
      },
    ])
    await this.animateRichText(id, cmd.text)
  }

  private async drawText(cmd: TextCommand) {
    const id = createShapeId()
    this.editor.createShapes([
      {
        id,
        type: 'text',
        x: cmd.x,
        y: cmd.y,
        props: {
          richText: toRichText(''),
          size: (cmd.size ?? 'm') as DrawSize,
          color: toTlColor(cmd.color),
          font: 'draw',
          textAlign: 'start',
          autoSize: true,
        },
      },
    ])
    await this.animateRichText(id, cmd.text)
  }

  private drawRect(cmd: RectCommand) {
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'geo',
        x: cmd.x,
        y: cmd.y,
        props: {
          geo: 'rectangle',
          w: cmd.w,
          h: cmd.h,
          richText: toRichText(cmd.label ?? ''),
          color: toTlColor(cmd.color),
          fill: 'semi',
          size: 'l',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
        },
      },
    ])
  }

  private drawCircle(cmd: CircleCommand) {
    const d = cmd.r * 2
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'geo',
        x: cmd.x - cmd.r,
        y: cmd.y - cmd.r,
        props: {
          geo: 'ellipse',
          w: d,
          h: d,
          richText: toRichText(cmd.label ?? ''),
          color: toTlColor(cmd.color),
          fill: 'semi',
          size: 'l',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
        },
      },
    ])
  }

  private drawArrow(cmd: ArrowCommand) {
    const dx = cmd.x2 - cmd.x1
    const dy = cmd.y2 - cmd.y1
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'arrow',
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          richText: toRichText(cmd.label ?? ''),
          color: toTlColor(cmd.color),
          size: 'l',
          arrowheadEnd: 'arrow',
          arrowheadStart: 'none',
          font: 'draw',
        },
      },
    ])
  }

  private drawLine(cmd: LineCommand) {
    const dx = cmd.x2 - cmd.x1
    const dy = cmd.y2 - cmd.y1
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'arrow',
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          color: toTlColor(cmd.color),
          size: 'm',
          arrowheadEnd: 'none',
          arrowheadStart: 'none',
        },
      },
    ])
  }

  private async drawBullet(cmd: BulletCommand) {
    const id = createShapeId()
    const y = cmd.y + cmd.index * 40
    this.editor.createShapes([
      {
        id,
        type: 'text',
        x: cmd.x,
        y,
        props: {
          richText: toRichText(''),
          size: 'm' as DrawSize,
          color: 'black' as DrawColor,
          font: 'draw',
          textAlign: 'start',
          autoSize: true,
        },
      },
    ])
    await this.animateRichText(id, `• ${cmd.text}`)
  }

  private drawHighlight(cmd: HighlightCommand) {
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'geo',
        x: cmd.x,
        y: cmd.y,
        opacity: 0.35,
        props: {
          geo: 'rectangle',
          w: cmd.w,
          h: cmd.h,
          color: toTlColor(cmd.color ?? 'yellow'),
          fill: 'semi',
          size: 'm',
        },
      },
    ])
  }

  private async drawUnderline(cmd: UnderlineCommand) {
    const id = createShapeId()
    const dx = cmd.x2 - cmd.x1
    const dy = cmd.y2 - cmd.y1
    const STEPS = 25
    this.editor.createShapes([
      {
        id,
        type: 'arrow',
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          color: toTlColor(cmd.color),
          size: 'l',
          dash: 'draw',
          arrowheadEnd: 'none',
          arrowheadStart: 'none',
        },
      },
    ])
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS
      this.editor.updateShapes([
        {
          id,
          type: 'arrow',
          props: { end: { x: dx * t, y: dy * t } },
        },
      ])
      await sleep(16)
    }
  }

  private async drawCircleEm(cmd: CircleEmCommand) {
    const id = createShapeId()
    const cx = cmd.x + cmd.w / 2
    const cy = cmd.y + cmd.h / 2
    const targetW = cmd.w + 24
    const targetH = cmd.h + 24
    const STEPS = 20
    this.editor.createShapes([
      {
        id,
        type: 'geo',
        x: cx,
        y: cy,
        props: {
          geo: 'ellipse',
          w: 2,
          h: 2,
          color: toTlColor(cmd.color),
          fill: 'none',
          dash: 'draw',
          size: 'l',
        },
      },
    ])
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS
      const w = targetW * t
      const h = targetH * t
      this.editor.updateShapes([
        {
          id,
          type: 'geo',
          x: cx - w / 2,
          y: cy - h / 2,
          props: { w, h },
        },
      ])
      await sleep(16)
    }
  }

  private drawSketchArrow(cmd: SketchArrowCommand) {
    const dx = cmd.x2 - cmd.x1
    const dy = cmd.y2 - cmd.y1
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: 'arrow',
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          richText: toRichText(cmd.label ?? ''),
          color: toTlColor(cmd.color),
          size: 'l',
          dash: 'draw',
          arrowheadEnd: 'arrow',
          arrowheadStart: 'none',
          font: 'draw',
        },
      },
    ])
  }
}
