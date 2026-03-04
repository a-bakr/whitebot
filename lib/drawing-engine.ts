import type {
  BoxCommand,
  CircleCommand,
  ConnectCommand,
  DiamondCommand,
  DrawColor,
  DrawCommand,
  DrawSize,
  HeadingCommand,
  HighlightCommand,
  Rel,
  TextCommand,
} from "./drawing-types";
import { Editor, TLShapeId, createShapeId, toRichText } from "tldraw";

// ── Colour mapping ────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, DrawColor> = {
  blue: "blue",
  red: "red",
  green: "green",
  orange: "orange",
  yellow: "yellow",
  violet: "violet",
  black: "black",
  grey: "grey",
  gray: "grey",
  white: "white",
  "light-blue": "light-blue",
  "light-green": "light-green",
  "light-red": "light-red",
  "light-violet": "light-violet",
};

function toTlColor(color?: string): DrawColor {
  if (!color) return "black";
  return COLOR_MAP[color.toLowerCase()] ?? "black";
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Default shape sizes (canvas units) ────────────────────────────────────────

const SIZES = {
  box: { w: 240, h: 90 },
  circle: { w: 130, h: 130 },
  diamond: { w: 200, h: 110 },
} as const;

/** Horizontal gap between shapes when using relational positioning. */
const H_GAP = 70;
/** Vertical gap between shapes when using relational positioning. */
const V_GAP = 60;
/** Left margin for auto-placed shapes. */
const PAD = 80;

// ── Shape registry ────────────────────────────────────────────────────────────

interface ShapeRecord {
  tldrawId: TLShapeId;
}

// ── DrawingEngine ─────────────────────────────────────────────────────────────

export class DrawingEngine {
  private shapes = new Map<string, ShapeRecord>();
  private _autoN = 0;

  constructor(private editor: Editor) {}

  // ── Internal helpers ────────────────────────────────────────────────────────

  private nextAutoId(): string {
    return `_a${++this._autoN}`;
  }

  private register(semanticId: string, tldrawId: TLShapeId): void {
    this.shapes.set(semanticId, { tldrawId });
  }

  private getBounds(
    id: string,
  ): { x: number; y: number; w: number; h: number } | null {
    const rec = this.shapes.get(id);
    if (!rec) return null;
    const b = this.editor.getShapePageBounds(rec.tldrawId);
    if (!b) return null;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }

  /** Y coordinate just below all existing canvas content. */
  private getNextY(): number {
    const bounds = this.editor.getCurrentPageBounds();
    if (!bounds) return 80;
    return Math.ceil(bounds.maxY) + V_GAP;
  }

  /**
   * Compute position relative to a reference shape.
   * Returns null if the reference shape is not found.
   */
  private resolveRelative(
    rel: Rel,
    refId: string,
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    const ref = this.getBounds(refId);
    if (!ref) return null;

    switch (rel) {
      case "right-of":
        return {
          x: Math.round(ref.x + ref.w + H_GAP),
          y: Math.round(ref.y + (ref.h - h) / 2),
        };
      case "left-of":
        return {
          x: Math.round(ref.x - H_GAP - w),
          y: Math.round(ref.y + (ref.h - h) / 2),
        };
      case "below":
        return {
          x: Math.round(ref.x + (ref.w - w) / 2),
          y: Math.round(ref.y + ref.h + V_GAP),
        };
      case "above":
        return {
          x: Math.round(ref.x + (ref.w - w) / 2),
          y: Math.round(ref.y - V_GAP - h),
        };
    }
  }

  /**
   * Compute edge-to-edge arrow coordinates between two registered shapes.
   * Returns null if either shape is not found.
   */
  private resolveEdge(
    fromId: string,
    toId: string,
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const from = this.getBounds(fromId);
    const to = this.getBounds(toId);
    if (!from || !to) return null;

    const fromCX = from.x + from.w / 2;
    const fromCY = from.y + from.h / 2;
    const toCX = to.x + to.w / 2;
    const toCY = to.y + to.h / 2;

    const dx = toCX - fromCX;
    const dy = toCY - fromCY;

    let x1: number, y1: number, x2: number, y2: number;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal connection
      if (dx >= 0) {
        x1 = Math.round(from.x + from.w);
        y1 = Math.round(fromCY);
        x2 = Math.round(to.x);
        y2 = Math.round(toCY);
      } else {
        x1 = Math.round(from.x);
        y1 = Math.round(fromCY);
        x2 = Math.round(to.x + to.w);
        y2 = Math.round(toCY);
      }
    } else {
      // Vertical connection
      if (dy >= 0) {
        x1 = Math.round(fromCX);
        y1 = Math.round(from.y + from.h);
        x2 = Math.round(toCX);
        y2 = Math.round(to.y);
      } else {
        x1 = Math.round(fromCX);
        y1 = Math.round(from.y);
        x2 = Math.round(toCX);
        y2 = Math.round(to.y + to.h);
      }
    }

    return { x1, y1, x2, y2 };
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  async executeCommand(cmd: DrawCommand, animationBudgetMs?: number) {
    switch (cmd.cmd) {
      case "clear":
        this.clear();
        break;
      case "heading":
        await this.drawHeading(cmd, animationBudgetMs);
        break;
      case "box":
        this.drawBox(cmd);
        break;
      case "circle":
        this.drawCircle(cmd);
        break;
      case "diamond":
        this.drawDiamond(cmd);
        break;
      case "text":
        await this.drawText(cmd, animationBudgetMs);
        break;
      case "connect":
        this.drawConnect(cmd);
        break;
      case "highlight":
        await this.drawHighlight(cmd);
        break;
    }
  }

  // ── Canvas operations ─────────────────────────────────────────────────────

  clear(): void {
    const ids = [...this.editor.getCurrentPageShapeIds()];
    if (ids.length > 0) this.editor.deleteShapes(ids);
    this.shapes.clear();
    this._autoN = 0;
  }

  // ── Shape drawing ─────────────────────────────────────────────────────────

  private async drawHeading(cmd: HeadingCommand, budgetMs?: number) {
    const id = createShapeId();
    const sid = cmd.id ?? this.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: PAD,
        y: this.getNextY(),
        props: {
          richText: toRichText(""),
          size: "xl" as DrawSize,
          color: toTlColor(cmd.color),
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
    this.register(sid, id);
    await this.animateText(id, cmd.text, budgetMs);
  }

  private drawBox(cmd: BoxCommand): void {
    const { w, h } = SIZES.box;
    const pos =
      cmd.rel && cmd.ref
        ? (this.resolveRelative(cmd.rel, cmd.ref, w, h) ?? {
            x: PAD,
            y: this.getNextY(),
          })
        : { x: PAD, y: this.getNextY() };

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: "rectangle",
          w,
          h,
          richText: toRichText(cmd.label),
          color: toTlColor(cmd.color),
          fill: "semi",
          dash: "solid",
          size: "l",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.register(cmd.id, id);
  }

  private drawCircle(cmd: CircleCommand): void {
    const { w, h } = SIZES.circle;
    const pos =
      cmd.rel && cmd.ref
        ? (this.resolveRelative(cmd.rel, cmd.ref, w, h) ?? {
            x: PAD,
            y: this.getNextY(),
          })
        : { x: PAD, y: this.getNextY() };

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: "ellipse",
          w,
          h,
          richText: toRichText(cmd.label),
          color: toTlColor(cmd.color),
          fill: "semi",
          dash: "solid",
          size: "l",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.register(cmd.id, id);
  }

  private drawDiamond(cmd: DiamondCommand): void {
    const { w, h } = SIZES.diamond;
    const pos =
      cmd.rel && cmd.ref
        ? (this.resolveRelative(cmd.rel, cmd.ref, w, h) ?? {
            x: PAD,
            y: this.getNextY(),
          })
        : { x: PAD, y: this.getNextY() };

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: "diamond",
          w,
          h,
          richText: toRichText(cmd.label),
          color: toTlColor(cmd.color),
          fill: "semi",
          dash: "solid",
          size: "l",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.register(cmd.id, id);
  }

  private async drawText(cmd: TextCommand, budgetMs?: number) {
    const pos =
      cmd.rel && cmd.ref
        ? (this.resolveRelative(cmd.rel, cmd.ref, 350, 36) ?? {
            x: PAD,
            y: this.getNextY(),
          })
        : { x: PAD, y: this.getNextY() };

    const id = createShapeId();
    const sid = cmd.id ?? this.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(""),
          size: (cmd.size ?? "m") as DrawSize,
          color: toTlColor(cmd.color),
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
    this.register(sid, id);
    await this.animateText(id, cmd.text, budgetMs);
  }

  private drawConnect(cmd: ConnectCommand): void {
    const coords = this.resolveEdge(cmd.from, cmd.to);
    if (!coords) {
      console.warn(
        `[DrawingEngine] connect: shape "${cmd.from}" or "${cmd.to}" not found — emit connect AFTER both shapes`,
      );
      return;
    }

    const { x1, y1, x2, y2 } = coords;
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: x1,
        y: y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: x2 - x1, y: y2 - y1 },
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          dash: cmd.style === "dashed" ? "dashed" : "solid",
          size: "m",
          font: "draw",
          arrowheadEnd: "arrow",
          arrowheadStart: "none",
        },
      },
    ]);
  }

  private async drawHighlight(cmd: HighlightCommand) {
    const bounds = this.getBounds(cmd.target);
    if (!bounds) {
      console.warn(
        `[DrawingEngine] highlight: shape "${cmd.target}" not found`,
      );
      return;
    }

    const PAD_EM = 16;
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const targetW = bounds.w + PAD_EM * 2;
    const targetH = bounds.h + PAD_EM * 2;
    const STEPS = 20;

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: cx,
        y: cy,
        props: {
          geo: "ellipse",
          w: 2,
          h: 2,
          color: toTlColor(cmd.color ?? "orange"),
          fill: "none",
          dash: "draw",
          size: "l",
        },
      },
    ]);

    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const w = targetW * t;
      const h = targetH * t;
      this.editor.updateShapes([
        { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
      ]);
      await sleep(16);
    }
  }

  // ── Text typewriter animation ─────────────────────────────────────────────

  /**
   * Typewriter animation. When budgetMs is provided, the animation stretches
   * to fill the time: 30% pre-delay → 50% typewriter → 20% hold.
   */
  private async animateText(
    id: TLShapeId,
    text: string,
    budgetMs?: number,
  ): Promise<void> {
    let charDelay = 22;
    let preDelay = 0;

    if (budgetMs && budgetMs > 200 && text.length > 0) {
      preDelay = Math.round(budgetMs * 0.3);
      const typewriterBudget = budgetMs * 0.5;
      charDelay = Math.max(
        15,
        Math.min(80, Math.round(typewriterBudget / text.length)),
      );
    }

    if (preDelay > 0) await sleep(preDelay);

    let current = "";
    for (const char of text) {
      current += char;
      this.editor.updateShapes([
        { id, type: "text", props: { richText: toRichText(current) } },
      ]);
      await sleep(charDelay);
    }
  }
}
