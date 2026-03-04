export type DrawColor =
  | "black"
  | "blue"
  | "green"
  | "grey"
  | "light-blue"
  | "light-green"
  | "light-red"
  | "light-violet"
  | "orange"
  | "red"
  | "violet"
  | "white"
  | "yellow";

export type DrawSize = "s" | "m" | "l" | "xl";

/** Relational positioning — where to place a shape relative to a reference shape. */
export type Rel = "right-of" | "left-of" | "above" | "below";

// ── Draw commands ────────────────────────────────────────────────────────────

export interface ClearCommand {
  t: "draw";
  cmd: "clear";
}

/** Section heading — always placed below all existing content. */
export interface HeadingCommand {
  t: "draw";
  cmd: "heading";
  id?: string;
  text: string;
  color?: DrawColor;
}

/** Rectangle shape. */
export interface BoxCommand {
  t: "draw";
  cmd: "box";
  id: string;
  label: string;
  color?: DrawColor;
  /** Relational placement — where to put this relative to `ref`. Omit to auto-place below all content. */
  rel?: Rel;
  ref?: string;
}

/** Ellipse / circle shape. */
export interface CircleCommand {
  t: "draw";
  cmd: "circle";
  id: string;
  label: string;
  color?: DrawColor;
  rel?: Rel;
  ref?: string;
}

/** Diamond / decision shape. */
export interface DiamondCommand {
  t: "draw";
  cmd: "diamond";
  id: string;
  label: string;
  color?: DrawColor;
  rel?: Rel;
  ref?: string;
}

/** Free text annotation. */
export interface TextCommand {
  t: "draw";
  cmd: "text";
  id?: string;
  text: string;
  size?: DrawSize;
  color?: DrawColor;
  rel?: Rel;
  ref?: string;
}

/** Arrow connecting two shapes by their semantic IDs. Always emit AFTER both shapes exist. */
export interface ConnectCommand {
  t: "draw";
  cmd: "connect";
  from: string;
  to: string;
  label?: string;
  color?: DrawColor;
  /** "dashed" for weaker/optional relationships. Default: "solid". */
  style?: "solid" | "dashed";
}

/** Animated emphasis circle drawn around an existing shape. */
export interface HighlightCommand {
  t: "draw";
  cmd: "highlight";
  target: string;
  color?: DrawColor;
}

export type DrawCommand =
  | ClearCommand
  | HeadingCommand
  | BoxCommand
  | CircleCommand
  | DiamondCommand
  | TextCommand
  | ConnectCommand
  | HighlightCommand;

// ── Non-draw commands ────────────────────────────────────────────────────────

export interface SpeechCommand {
  t: "speech";
  text: string;
}

export interface FollowupCommand {
  t: "followup";
  questions: string[];
}

export type TutorCommand = DrawCommand | SpeechCommand | FollowupCommand;
