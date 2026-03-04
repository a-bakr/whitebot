import type { LayoutType } from './layout-templates'

export type DrawColor =
  | 'black'
  | 'blue'
  | 'green'
  | 'grey'
  | 'light-blue'
  | 'light-green'
  | 'light-red'
  | 'light-violet'
  | 'orange'
  | 'red'
  | 'violet'
  | 'white'
  | 'yellow'

export type DrawSize = 's' | 'm' | 'l' | 'xl'

// ── Legacy coordinate-based commands (still supported as fallback) ─────────

export interface ClearCommand {
  t: 'draw'
  cmd: 'clear'
}

export interface TitleCommand {
  t: 'draw'
  cmd: 'title'
  id?: string
  text: string
  x: number
  y: number
  color?: DrawColor
}

export interface TextCommand {
  t: 'draw'
  cmd: 'text'
  id?: string
  text: string
  x: number
  y: number
  color?: DrawColor
  size?: DrawSize
}

export interface RectCommand {
  t: 'draw'
  cmd: 'rect'
  id?: string
  x: number
  y: number
  w: number
  h: number
  label?: string
  color?: DrawColor
}

export interface CircleCommand {
  t: 'draw'
  cmd: 'circle'
  id?: string
  x: number
  y: number
  r: number
  label?: string
  color?: DrawColor
}

export interface ArrowCommand {
  t: 'draw'
  cmd: 'arrow'
  id?: string
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
  color?: DrawColor
}

export interface LineCommand {
  t: 'draw'
  cmd: 'line'
  id?: string
  x1: number
  y1: number
  x2: number
  y2: number
  color?: DrawColor
}

export interface BulletCommand {
  t: 'draw'
  cmd: 'bullet'
  id?: string
  x: number
  y: number
  text: string
  index: number
}

export interface HighlightCommand {
  t: 'draw'
  cmd: 'highlight'
  id?: string
  x: number
  y: number
  w: number
  h: number
  color?: DrawColor
}

export interface UnderlineCommand {
  t: 'draw'
  cmd: 'underline'
  id?: string
  x1: number
  y1: number
  x2: number
  y2: number
  color?: DrawColor
}

export interface CircleEmCommand {
  t: 'draw'
  cmd: 'circle-em'
  id?: string
  x: number
  y: number
  w: number
  h: number
  color?: DrawColor
}

export interface SketchArrowCommand {
  t: 'draw'
  cmd: 'sketch-arrow'
  id?: string
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
  color?: DrawColor
}

// ── Semantic layout commands (Phase 2 / 3) ────────────────────────────────

/** Single node entry in a section plan. */
export interface PlanEntry {
  id: string
  shape: 'rect' | 'circle' | 'diamond' | 'text'
  label?: string
}

/** Declare a new layout section. Engine picks Y automatically. */
export interface SectionCommand {
  t: 'draw'
  cmd: 'section'
  id: string
  layout: LayoutType
  title: string
  /**
   * Full node plan — declare ALL nodes upfront so the engine can
   * pre-compute a perfectly centred layout before any node is drawn.
   * Replaces the old `nodes` count hint.
   */
  plan?: PlanEntry[]
  /** Legacy count hint (still accepted; ignored when plan is provided). */
  nodes?: number
}

/** Place a node into a section. Engine computes pixel position from template. */
export interface NodeCommand {
  t: 'draw'
  cmd: 'node'
  id: string
  section: string
  shape: 'rect' | 'circle' | 'diamond' | 'text'
  label: string
  color?: DrawColor
}

/** Connect two nodes by semantic ID. Engine resolves real edge coordinates. */
export interface EdgeCommand {
  t: 'draw'
  cmd: 'edge'
  from: string
  to: string
  label?: string
  color?: DrawColor
}

/** Place a text annotation anchored to a semantic node. */
export interface NoteCommand {
  t: 'draw'
  cmd: 'note'
  anchor: string
  pos: 'above' | 'below' | 'left' | 'right' | 'inside'
  text: string
  color?: DrawColor
  size?: DrawSize
}

export type DrawCommand =
  | ClearCommand
  | TitleCommand
  | TextCommand
  | RectCommand
  | CircleCommand
  | ArrowCommand
  | LineCommand
  | BulletCommand
  | HighlightCommand
  | UnderlineCommand
  | CircleEmCommand
  | SketchArrowCommand
  | SectionCommand
  | NodeCommand
  | EdgeCommand
  | NoteCommand

export interface SpeechCommand {
  t: 'speech'
  text: string
}

export interface FollowupCommand {
  t: 'followup'
  questions: string[]
}

export type TutorCommand = DrawCommand | SpeechCommand | FollowupCommand
