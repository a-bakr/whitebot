import type {
  BoxCommand,
  BulletCommand,
  CalloutCommand,
  CircleCommand,
  ConnectCommand,
  DiamondCommand,
  DrawColor,
  DrawCommand,
  DrawSize,
  EmojiCommand,
  HeadingCommand,
  HighlightCommand,
  NoteCommand,
  PanCommand,
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
  box: { w: 220, h: 80 },
  circle: { w: 130, h: 130 },
  diamond: { w: 200, h: 110 },
  callout: { w: 220, h: 90 },
  note: { w: 200, h: 200 },
  emoji: { w: 80, h: 80 },
} as const;

/** Horizontal gap between shapes when using relational positioning. */
const H_GAP = 60;
/** Vertical gap between shapes when using relational positioning. */
const V_GAP = 50;
/** Left margin for auto-placed shapes. */
const PAD = 80;
/** Number of animation frames for scale-in effect. */
const SCALE_STEPS = 12;
/** ms per frame for scale-in animation (~60fps). */
const SCALE_FRAME_MS = 16;
/** ms per frame for arrow draw-in animation. */
const ARROW_FRAME_MS = 16;
/** Number of animation frames for arrow draw-in. */
const ARROW_STEPS = 15;

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
   * Resolve a position for a new shape.
   * Uses relational positioning when rel+ref are provided, otherwise auto-places.
   */
  private resolvePosition(
    rel: Rel | undefined,
    refId: string | undefined,
    w: number,
    h: number,
  ): { x: number; y: number } {
    if (rel && refId) {
      const pos = this.resolveRelative(rel, refId, w, h);
      if (pos) return pos;
    }
    return { x: PAD, y: this.getNextY() };
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

  // ── Camera helpers ───────────────────────────────────────────────────────────

  /**
   * Smoothly pan the camera to keep a shape in view.
   * Does NOT change zoom level — only pans if the shape is outside the visible area.
   */
  public panToLatestShape(id?: TLShapeId): void {
    if (!id) return;
    try {
      const bounds = this.editor.getShapePageBounds(id);
      if (!bounds) return;

      const viewport = this.editor.getViewportPageBounds();
      if (!viewport) return;

      const shapeCX = bounds.x + bounds.w / 2;
      const shapeCY = bounds.y + bounds.h / 2;

      // Generous margin so we pan before the shape touches the edge
      const mx = viewport.w * 0.25;
      const my = viewport.h * 0.25;

      const outsideX =
        bounds.x < viewport.x + mx ||
        bounds.x + bounds.w > viewport.x + viewport.w - mx;
      const outsideY =
        bounds.y < viewport.y + my ||
        bounds.y + bounds.h > viewport.y + viewport.h - my;

      if (outsideX || outsideY) {
        this.editor.centerOnPoint(
          { x: shapeCX, y: shapeCY },
          { animation: { duration: 450 } },
        );
      }
    } catch {
      // Camera errors are non-fatal
    }
  }

  // ── Scale-in animation ───────────────────────────────────────────────────────

  /**
   * Animate a geo/note shape scaling in from a tiny point to its full size.
   * The center stays fixed during the animation (ease-out curve).
   */
  private async scaleIn(
    id: TLShapeId,
    type: "geo" | "note",
    cx: number,
    cy: number,
    finalW: number,
    finalH: number,
  ): Promise<void> {
    for (let i = 1; i <= SCALE_STEPS; i++) {
      const t = i / SCALE_STEPS;
      // Ease-out: fast start, smooth landing
      const e = 1 - Math.pow(1 - t, 2);
      const w = Math.max(4, finalW * e);
      const h = Math.max(4, finalH * e);
      this.editor.updateShapes([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id, type, x: cx - w / 2, y: cy - h / 2, props: { w, h } } as any,
      ]);
      await sleep(SCALE_FRAME_MS);
    }
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  async executeCommand(cmd: DrawCommand) {
    switch (cmd.cmd) {
      case "clear":
        this.clear();
        break;
      case "heading":
        await this.drawHeading(cmd);
        break;
      case "box":
        await this.drawBox(cmd);
        break;
      case "circle":
        await this.drawCircle(cmd);
        break;
      case "diamond":
        await this.drawDiamond(cmd);
        break;
      case "text":
        await this.drawText(cmd);
        break;
      case "note":
        await this.drawNote(cmd);
        break;
      case "callout":
        await this.drawCallout(cmd);
        break;
      case "emoji":
        this.drawEmoji(cmd);
        break;
      case "bullet":
        await this.drawBullet(cmd);
        break;
      case "connect":
        await this.drawConnect(cmd);
        break;
      case "highlight":
        await this.drawHighlight(cmd);
        break;
      case "pan":
        this.executePan(cmd);
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

  private async drawHeading(cmd: HeadingCommand) {
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
    this.panToLatestShape(id);
    await this.animateText(id, cmd.text);
  }

  private async drawBox(cmd: BoxCommand): Promise<void> {
    const { w, h } = SIZES.box;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, w, h);
    const cx = pos.x + w / 2;
    const cy = pos.y + h / 2;

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: cx - 2,
        y: cy - 2,
        props: {
          geo: "rectangle",
          w: 4,
          h: 4,
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
    this.panToLatestShape(id);
    await this.scaleIn(id, "geo", cx, cy, w, h);
  }

  private async drawCircle(cmd: CircleCommand): Promise<void> {
    const { w, h } = SIZES.circle;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, w, h);
    const cx = pos.x + w / 2;
    const cy = pos.y + h / 2;

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: cx - 2,
        y: cy - 2,
        props: {
          geo: "ellipse",
          w: 4,
          h: 4,
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
    this.panToLatestShape(id);
    await this.scaleIn(id, "geo", cx, cy, w, h);
  }

  private async drawDiamond(cmd: DiamondCommand): Promise<void> {
    const { w, h } = SIZES.diamond;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, w, h);
    const cx = pos.x + w / 2;
    const cy = pos.y + h / 2;

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: cx - 2,
        y: cy - 2,
        props: {
          geo: "diamond",
          w: 4,
          h: 4,
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
    this.panToLatestShape(id);
    await this.scaleIn(id, "geo", cx, cy, w, h);
  }

  private async drawText(cmd: TextCommand) {
    const pos = this.resolvePosition(cmd.rel, cmd.ref, 350, 36);

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
    this.panToLatestShape(id);
    await this.animateText(id, cmd.text);
  }

  /**
   * Sticky note — uses tldraw's native `note` shape with a colored background.
   * Perfect for key definitions, important concepts, and memorable takeaways.
   */
  private async drawNote(cmd: NoteCommand): Promise<void> {
    const { w, h } = SIZES.note;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, w, h);

    const id = createShapeId();
    // Note colors in tldraw: yellow, blue, green, orange, violet, grey, red, white, black
    // Map our color names to tldraw note colors
    const noteColor = toTlColor(cmd.color) ?? "yellow";

    this.editor.createShapes([
      {
        id,
        type: "note",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(""),
          color: noteColor,
          size: "m",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          fontSizeAdjustment: 0,
          url: "",
        },
      },
    ]);
    this.register(cmd.id, id);
    this.panToLatestShape(id);
    await this.animateText(id, cmd.text, "note");
  }

  /**
   * Callout / speech bubble — uses tldraw's geo callout type.
   * Great for "aha!" moments, common mistakes, teacher commentary.
   */
  private async drawCallout(cmd: CalloutCommand): Promise<void> {
    const { w, h } = SIZES.callout;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, w, h);
    const cx = pos.x + w / 2;
    const cy = pos.y + h / 2;

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: cx - 2,
        y: cy - 2,
        props: {
          geo: "rectangle",
          w: 4,
          h: 4,
          richText: toRichText(cmd.text),
          color: toTlColor(cmd.color),
          fill: "semi",
          dash: "solid",
          size: "m",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.register(cmd.id, id);
    this.panToLatestShape(id);
    await this.scaleIn(id, "geo", cx, cy, w, h);
  }

  /**
   * Large emoji — rendered as an oversized text character.
   * Use as a visual anchor: 💡 for ideas, ⚡ for energy, ✅ for correct answers, etc.
   */
  private drawEmoji(cmd: EmojiCommand): void {
    const pos = this.resolvePosition(cmd.rel, cmd.ref, 80, 80);

    const id = createShapeId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(cmd.char),
          size: "xl",
          font: "sans",
          textAlign: "middle",
          autoSize: true,
          color: "black",
        },
      },
    ]);
    this.register(cmd.id, id);
    this.panToLatestShape(id);
  }

  /**
   * Bullet list item — typewriter-animated text with bullet or number prefix.
   * Stacks automatically below existing content.
   */
  private async drawBullet(cmd: BulletCommand): Promise<void> {
    const prefix = cmd.index != null ? `${cmd.index}. ` : "• ";
    const fullText = `${prefix}${cmd.text}`;
    const pos = this.resolvePosition(cmd.rel, cmd.ref, 400, 36);

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
          size: "m" as DrawSize,
          color: toTlColor(cmd.color),
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
    this.register(sid, id);
    this.panToLatestShape(id);
    await this.animateText(id, fullText);
  }

  /**
   * Arrow with draw-in animation — the line grows from start to end.
   * Creates a satisfying "drawing" effect rather than instant appearance.
   */
  private async drawConnect(cmd: ConnectCommand): Promise<void> {
    const coords = this.resolveEdge(cmd.from, cmd.to);
    if (!coords) {
      console.warn(
        `[DrawingEngine] connect: shape "${cmd.from}" or "${cmd.to}" not found — emit connect AFTER both shapes`,
      );
      return;
    }

    const { x1, y1, x2, y2 } = coords;
    const dx = x2 - x1;
    const dy = y2 - y1;

    const id = createShapeId();
    // Create arrow at zero length first (tiny stub)
    this.editor.createShapes([
      {
        id,
        type: "arrow",
        x: x1,
        y: y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0.01, y: 0.01 },
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

    // Animate arrow growing from start to end
    for (let i = 1; i <= ARROW_STEPS; i++) {
      const t = i / ARROW_STEPS;
      // Ease-in-out for a natural drawing feel
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.editor.updateShapes([
        {
          id,
          type: "arrow",
          props: {
            end: { x: dx * e, y: dy * e },
          },
        },
      ]);
      await sleep(ARROW_FRAME_MS);
    }
  }

  private async drawHighlight(cmd: HighlightCommand) {
    const bounds = this.getBounds(cmd.target);
    if (!bounds) {
      console.warn(
        `[DrawingEngine] highlight: shape "${cmd.target}" not found`,
      );
      return;
    }

    const PAD_EM = 18;
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

    // Expand circle outward + then pulse it twice
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const e = 1 - Math.pow(1 - t, 2); // ease-out
      const w = targetW * e;
      const h = targetH * e;
      this.editor.updateShapes([
        { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
      ]);
      await sleep(16);
    }

    // Brief pulse: shrink a little then expand back
    for (let pulse = 0; pulse < 2; pulse++) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const scale = 1 - 0.08 * Math.sin(Math.PI * t);
        const w = targetW * scale;
        const h = targetH * scale;
        this.editor.updateShapes([
          { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
        ]);
        await sleep(16);
      }
    }

    // Fade out: shrink back to nothing
    await sleep(200);
    for (let i = STEPS; i >= 0; i--) {
      const t = i / STEPS;
      const w = Math.max(2, targetW * t);
      const h = Math.max(2, targetH * t);
      this.editor.updateShapes([
        { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
      ]);
      await sleep(12);
    }
    this.editor.deleteShapes([id]);
  }

  private executePan(cmd: PanCommand): void {
    const rec = this.shapes.get(cmd.target);
    if (!rec) {
      console.warn(`[DrawingEngine] pan: shape "${cmd.target}" not found`);
      return;
    }
    this.panToLatestShape(rec.tldrawId);
  }

  // ── Text typewriter animation ─────────────────────────────────────────────

  /**
   * Typewriter animation — characters appear one by one at a natural pace.
   * For `note` shapes, uses the note's own text field update path.
   */
  private async animateText(
    id: TLShapeId,
    text: string,
    shapeType: "text" | "note" = "text",
  ): Promise<void> {
    // Natural character speed: ~35ms/char (feels like a fast typist)
    // Clamp between 15ms (very fast) and 60ms (thoughtful typing)
    const charDelay = Math.max(15, Math.min(60, 2000 / Math.max(text.length, 1)));

    let current = "";
    for (const char of text) {
      current += char;
      this.editor.updateShapes([
        {
          id,
          type: shapeType,
          props: { richText: toRichText(current) },
        },
      ]);
      await sleep(charDelay);
    }
  }
}
