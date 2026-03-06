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

/**
 * Sticky note — ideal for key definitions, terms, and concepts.
 * Colored background makes them pop visually.
 */
export interface NoteCommand {
  t: "draw";
  cmd: "note";
  id: string;
  text: string;
  /** yellow=definition, blue=concept, green=example, orange=warning, violet=theory */
  color?: DrawColor;
  rel?: Rel;
  ref?: string;
}

/**
 * Callout / speech-bubble — great for "aha!" moments, annotations,
 * common mistakes, or teacher commentary.
 */
export interface CalloutCommand {
  t: "draw";
  cmd: "callout";
  id: string;
  text: string;
  color?: DrawColor;
  rel?: Rel;
  ref?: string;
}

/**
 * Large emoji — use as a visual anchor to grab attention.
 * Examples: ⚡ for energy, 🚀 for launch, 💡 for idea, ✅ for correct, ❌ for wrong,
 * ⚖️ for balance, 🔄 for cycle, 🎯 for goal, 🌍 for global, 🔑 for key concept.
 */
export interface EmojiCommand {
  t: "draw";
  cmd: "emoji";
  id: string;
  /** The emoji character(s), e.g. "💡" or "🚀" */
  char: string;
  rel?: Rel;
  ref?: string;
}

/**
 * Bullet list item — stacks items vertically with bullet prefix.
 * Use for lists of properties, steps, or examples.
 */
export interface BulletCommand {
  t: "draw";
  cmd: "bullet";
  id?: string;
  text: string;
  /** 1-based index for numbered lists. Omit for bullet point. */
  index?: number;
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

/** Pan the camera to bring a shape into view. Does not create a shape. */
export interface PanCommand {
  t: "draw";
  cmd: "pan";
  target: string;
}

export type DrawCommand =
  | ClearCommand
  | HeadingCommand
  | BoxCommand
  | CircleCommand
  | DiamondCommand
  | TextCommand
  | NoteCommand
  | CalloutCommand
  | EmojiCommand
  | BulletCommand
  | ConnectCommand
  | HighlightCommand
  | PanCommand;

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
