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

export class DrawingEngine {
  constructor(private editor: Editor) {}

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
