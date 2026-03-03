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

export interface ClearCommand {
  t: 'draw'
  cmd: 'clear'
}

export interface TitleCommand {
  t: 'draw'
  cmd: 'title'
  text: string
  x: number
  y: number
  color?: DrawColor
}

export interface TextCommand {
  t: 'draw'
  cmd: 'text'
  text: string
  x: number
  y: number
  color?: DrawColor
  size?: DrawSize
}

export interface RectCommand {
  t: 'draw'
  cmd: 'rect'
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
  x: number
  y: number
  r: number
  label?: string
  color?: DrawColor
}

export interface ArrowCommand {
  t: 'draw'
  cmd: 'arrow'
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
  x1: number
  y1: number
  x2: number
  y2: number
  color?: DrawColor
}

export interface BulletCommand {
  t: 'draw'
  cmd: 'bullet'
  x: number
  y: number
  text: string
  index: number
}

export interface HighlightCommand {
  t: 'draw'
  cmd: 'highlight'
  x: number
  y: number
  w: number
  h: number
  color?: DrawColor
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

export interface SpeechCommand {
  t: 'speech'
  text: string
}

export type TutorCommand = DrawCommand | SpeechCommand
