import type {
  ArrowCommand,
  BulletCommand,
  CircleCommand,
  CircleEmCommand,
  DrawColor,
  DrawCommand,
  DrawSize,
  EdgeCommand,
  HighlightCommand,
  LineCommand,
  NodeCommand,
  NoteCommand,
  RectCommand,
  SectionCommand,
  SketchArrowCommand,
  TextCommand,
  TitleCommand,
  UnderlineCommand,
} from "./drawing-types";
import { CANVAS_W, CanvasStateManager } from "./canvas-state";
import { Editor, TLShapeId, createShapeId, toRichText } from "tldraw";

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

// ── Estimated bounds for pre-draw collision checks ────────────────────────
// These are conservative estimates; actual registered bounds come from tldraw.
function estimateBounds(
  cmd: DrawCommand,
): { x: number; y: number; w: number; h: number } | null {
  switch (cmd.cmd) {
    case "title":
      return { x: cmd.x, y: cmd.y, w: 400, h: 70 };
    case "text":
      return { x: cmd.x, y: cmd.y, w: 350, h: 40 };
    case "rect":
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    case "circle":
      return { x: cmd.x - cmd.r, y: cmd.y - cmd.r, w: cmd.r * 2, h: cmd.r * 2 };
    case "bullet":
      return { x: cmd.x, y: cmd.y + cmd.index * 40, w: 400, h: 40 };
    case "highlight":
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    case "circle-em":
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    default:
      return null;
  }
}

export class DrawingEngine {
  private state: CanvasStateManager;
  private _lastUserInteraction = 0;

  constructor(private editor: Editor) {
    this.state = new CanvasStateManager(editor);
    this._subscribeToUserInteraction();
  }

  getState(): CanvasStateManager {
    return this.state;
  }

  private _subscribeToUserInteraction() {
    const update = () => {
      this._lastUserInteraction = Date.now();
    };
    const el = this.editor.getContainer();
    el.addEventListener("pointerdown", update, { passive: true });
    el.addEventListener("wheel", update, { passive: true });
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  async executeCommand(cmd: DrawCommand) {
    switch (cmd.cmd) {
      case "clear":
        this.clear();
        break;
      case "title":
        await this.drawTitle(cmd);
        break;
      case "text":
        await this.drawText(cmd);
        break;
      case "rect":
        this.drawRect(cmd);
        break;
      case "circle":
        this.drawCircle(cmd);
        break;
      case "arrow":
        this.drawArrow(cmd);
        break;
      case "line":
        this.drawLine(cmd);
        break;
      case "bullet":
        await this.drawBullet(cmd);
        break;
      case "highlight":
        this.drawHighlight(cmd);
        break;
      case "underline":
        await this.drawUnderline(cmd);
        break;
      case "circle-em":
        await this.drawCircleEm(cmd);
        break;
      case "sketch-arrow":
        this.drawSketchArrow(cmd);
        break;
      // ── Semantic layout commands ──────────────────────────────────────
      case "section":
        await this.drawSection(cmd);
        break;
      case "node":
        this.drawNode(cmd);
        break;
      case "edge":
        this.drawEdge(cmd);
        break;
      case "note":
        await this.drawNote(cmd);
        break;
    }
  }

  // ── Camera helpers ────────────────────────────────────────────────────────

  clear() {
    const ids = [...this.editor.getCurrentPageShapeIds()];
    if (ids.length > 0) this.editor.deleteShapes(ids);
    // Reset state manager when canvas is cleared
    this.state = new CanvasStateManager(this.editor);
  }

  /** @deprecated Use state.getNextSectionY() */
  getNextSectionY(): number {
    return this.state.getNextSectionY();
  }

  getViewportBounds(): { x: number; y: number; w: number; h: number } {
    const vp = this.editor.getViewportPageBounds();
    return {
      x: Math.round(vp.x),
      y: Math.round(vp.y),
      w: Math.round(vp.w),
      h: Math.round(vp.h),
    };
  }

  scrollToSection(y: number): void {
    const vp = this.editor.getViewportPageBounds();
    this.editor.centerOnPoint(
      { x: vp.x + vp.w / 2, y: y + vp.h * 0.35 },
      { animation: { duration: 400 } },
    );
  }

  /**
   * Pan camera to show the latest drawn shape (if not recently user-controlled).
   * Uses real bounds from CanvasStateManager after shape registration.
   */
  panToLatestShape(): void {
    if (Date.now() - this._lastUserInteraction < 2000) return;

    const latestId = this.state.getLatestShapeId();
    if (!latestId) return;

    const bounds = this.state.getBounds(latestId);
    if (!bounds) return;

    const vp = this.editor.getViewportPageBounds();
    const MARGIN = 80;

    // Check if shape is already fully visible
    const fullyVisible =
      bounds.x >= vp.x + MARGIN &&
      bounds.x + bounds.w <= vp.x + vp.w - MARGIN &&
      bounds.y >= vp.y + MARGIN &&
      bounds.y + bounds.h <= vp.y + vp.h - MARGIN;

    if (fullyVisible) return;

    // Center on the shape's center point, biased toward top of viewport
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    this.editor.centerOnPoint(
      { x: centerX, y: centerY - vp.h * 0.1 },
      { animation: { duration: 350 } },
    );
  }

  // ── Typewriter animation ──────────────────────────────────────────────────

  private async animateRichText(id: TLShapeId, fullText: string) {
    let current = "";
    for (const char of fullText) {
      current += char;
      this.editor.updateShapes([
        { id, type: "text", props: { richText: toRichText(current) } },
      ]);
      await sleep(22);
    }
  }

  // ── Legacy coordinate-based draw methods (collision-guarded) ─────────────

  private async drawTitle(cmd: TitleCommand) {
    const est = { x: cmd.x, y: cmd.y, w: 400, h: 70 };
    const pos = this.state.findFreeRect(est, 16);
    const id = createShapeId();
    const sid = cmd.id ?? this.state.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(""),
          size: "xl" as DrawSize,
          color: toTlColor(cmd.color),
          font: "draw",
          textAlign: "middle",
          autoSize: true,
        },
      },
    ]);
    this.state.register(sid, id, "", { label: cmd.text, shape: "title" });
    await this.animateRichText(id, cmd.text);
  }

  private async drawText(cmd: TextCommand) {
    const est = { x: cmd.x, y: cmd.y, w: 350, h: 40 };
    const pos = this.state.findFreeRect(est, 12);
    const id = createShapeId();
    const sid = cmd.id ?? this.state.nextAutoId();
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
    this.state.register(sid, id, "", { label: cmd.text, shape: "text" });
    await this.animateRichText(id, cmd.text);
  }

  private drawRect(cmd: RectCommand) {
    const est = { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    const pos = this.state.findFreeRect(est);
    const id = createShapeId();
    const sid = cmd.id ?? this.state.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: "rectangle",
          w: cmd.w,
          h: cmd.h,
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          fill: "semi",
          size: "l",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.state.register(sid, id, "", {
      label: cmd.label,
      color: cmd.color,
      shape: "rect",
    });
  }

  private drawCircle(cmd: CircleCommand) {
    const d = cmd.r * 2;
    const est = { x: cmd.x - cmd.r, y: cmd.y - cmd.r, w: d, h: d };
    const pos = this.state.findFreeRect(est);
    const id = createShapeId();
    const sid = cmd.id ?? this.state.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: "ellipse",
          w: d,
          h: d,
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          fill: "semi",
          size: "l",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
        },
      },
    ]);
    this.state.register(sid, id, "", {
      label: cmd.label,
      color: cmd.color,
      shape: "circle",
    });
  }

  private drawArrow(cmd: ArrowCommand) {
    // Arrows are not collision-checked — they intentionally span between shapes.
    const dx = cmd.x2 - cmd.x1;
    const dy = cmd.y2 - cmd.y1;
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          size: "l",
          arrowheadEnd: "arrow",
          arrowheadStart: "none",
          font: "draw",
        },
      },
    ]);
  }

  private drawLine(cmd: LineCommand) {
    const dx = cmd.x2 - cmd.x1;
    const dy = cmd.y2 - cmd.y1;
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          color: toTlColor(cmd.color),
          size: "m",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);
  }

  private async drawBullet(cmd: BulletCommand) {
    const y = cmd.y + cmd.index * 40;
    const est = { x: cmd.x, y, w: 400, h: 40 };
    const pos = this.state.findFreeRect(est, 8);
    const id = createShapeId();
    const sid = cmd.id ?? this.state.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(""),
          size: "m" as DrawSize,
          color: "black" as DrawColor,
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
    this.state.register(sid, id, "", { label: cmd.text, shape: "text" });
    await this.animateRichText(id, `• ${cmd.text}`);
  }

  private drawHighlight(cmd: HighlightCommand) {
    // Highlights overlay existing shapes — skip collision check.
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "geo",
        x: cmd.x,
        y: cmd.y,
        opacity: 0.35,
        props: {
          geo: "rectangle",
          w: cmd.w,
          h: cmd.h,
          color: toTlColor(cmd.color ?? "yellow"),
          fill: "semi",
          size: "m",
        },
      },
    ]);
  }

  private async drawUnderline(cmd: UnderlineCommand) {
    const id = createShapeId();
    const dx = cmd.x2 - cmd.x1;
    const dy = cmd.y2 - cmd.y1;
    const STEPS = 25;
    this.editor.createShapes([
      {
        id,
        type: "arrow",
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          color: toTlColor(cmd.color),
          size: "l",
          dash: "draw",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      this.editor.updateShapes([
        { id, type: "arrow", props: { end: { x: dx * t, y: dy * t } } },
      ]);
      await sleep(16);
    }
  }

  private async drawCircleEm(cmd: CircleEmCommand) {
    const id = createShapeId();
    const cx = cmd.x + cmd.w / 2;
    const cy = cmd.y + cmd.h / 2;
    const targetW = cmd.w + 24;
    const targetH = cmd.h + 24;
    const STEPS = 20;
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
          color: toTlColor(cmd.color),
          fill: "none",
          dash: "draw",
          size: "l",
        },
      },
    ]);
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const w = targetW * t,
        h = targetH * t;
      this.editor.updateShapes([
        { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
      ]);
      await sleep(16);
    }
  }

  private drawSketchArrow(cmd: SketchArrowCommand) {
    const dx = cmd.x2 - cmd.x1;
    const dy = cmd.y2 - cmd.y1;
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: cmd.x1,
        y: cmd.y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          size: "l",
          dash: "draw",
          arrowheadEnd: "arrow",
          arrowheadStart: "none",
          font: "draw",
        },
      },
    ]);
  }

  // ── Semantic layout commands ───────────────────────────────────────────────

  private async drawSection(cmd: SectionCommand) {
    const totalNodes = cmd.plan ? cmd.plan.length : (cmd.nodes ?? 6);
    const sec = this.state.startSection(
      cmd.id,
      cmd.layout,
      cmd.title,
      totalNodes,
      cmd.plan,
    );

    // Draw a grey divider line above the section (skip for the very first section)
    if (sec.yStart > 100) {
      const dividerY = sec.yStart - 45;
      const xMax = CANVAS_W - 60;
      const dividerId = createShapeId();
      this.editor.createShapes([
        {
          id: dividerId,
          type: "arrow",
          x: 60,
          y: dividerY,
          props: {
            start: { x: 0, y: 0 },
            end: { x: xMax - 60, y: 0 },
            color: "grey" as never,
            size: "m",
            arrowheadEnd: "none",
            arrowheadStart: "none",
          },
        },
      ]);
      // Register divider as section chrome so it won't block node placement
      this.state.addSectionChrome(dividerId);
    }

    // Draw the section title (use fixed canvas width for centering)
    const titleX = Math.round(CANVAS_W / 2 - 200);
    const titleId = createShapeId();
    const titleSid = `${cmd.id}__title`;
    this.editor.createShapes([
      {
        id: titleId,
        type: "text",
        x: titleX,
        y: sec.yStart,
        props: {
          richText: toRichText(""),
          size: "xl" as DrawSize,
          color: "black" as DrawColor,
          font: "draw",
          textAlign: "middle",
          autoSize: true,
        },
      },
    ]);
    // Register title as section chrome so it won't block node placement
    this.state.addSectionChrome(titleId);
    this.state.register(titleSid, titleId, "", {
      label: cmd.title,
      shape: "title",
    });
    await this.animateRichText(titleId, cmd.title);
  }

  private drawNode(cmd: NodeCommand) {
    // Compute position — uses pre-computed slot when section was declared with a plan
    const slot = this.state.computeNodeBounds(cmd.section, cmd.shape, cmd.id);

    // Only use collision guard for the live-computation fallback path.
    // Pre-computed slots are already perfectly placed — don't nudge them.
    const sec = this.state.getSection(cmd.section);
    const isPreComputed = !!sec?.pendingSlots.has(cmd.id);
    const safe = isPreComputed
      ? slot
      : this.state.findFreeRect(slot, 24, /* excludeSectionChrome */ true);

    const id = createShapeId();

    switch (cmd.shape) {
      case "circle": {
        const r = Math.round(Math.min(safe.w, safe.h) / 2);
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: safe.x + safe.w / 2 - r,
            y: safe.y + safe.h / 2 - r,
            props: {
              geo: "ellipse",
              w: r * 2,
              h: r * 2,
              richText: toRichText(cmd.label),
              color: toTlColor(cmd.color),
              fill: "semi",
              size: "l",
              font: "draw",
              align: "middle",
              verticalAlign: "middle",
            },
          },
        ]);
        break;
      }
      case "diamond": {
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: safe.x,
            y: safe.y,
            props: {
              geo: "diamond",
              w: safe.w,
              h: safe.h,
              richText: toRichText(cmd.label),
              color: toTlColor(cmd.color),
              fill: "semi",
              size: "l",
              font: "draw",
              align: "middle",
              verticalAlign: "middle",
            },
          },
        ]);
        break;
      }
      case "text": {
        this.editor.createShapes([
          {
            id,
            type: "text",
            x: safe.x,
            y: safe.y,
            props: {
              richText: toRichText(cmd.label),
              size: "m" as DrawSize,
              color: toTlColor(cmd.color),
              font: "draw",
              textAlign: "start",
              autoSize: true,
            },
          },
        ]);
        break;
      }
      default: {
        // rect (default)
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: safe.x,
            y: safe.y,
            props: {
              geo: "rectangle",
              w: safe.w,
              h: safe.h,
              richText: toRichText(cmd.label),
              color: toTlColor(cmd.color),
              fill: "semi",
              size: "l",
              font: "draw",
              align: "middle",
              verticalAlign: "middle",
            },
          },
        ]);
      }
    }

    this.state.register(cmd.id, id, cmd.section, {
      label: cmd.label,
      color: cmd.color,
      shape: cmd.shape,
    });

    // Increment section node count after registration
    if (sec) sec.nodeCount = sec.nodeIds.length;
  }

  private drawEdge(cmd: EdgeCommand) {
    // Resolve real edge-to-edge coordinates from actual shape bounds
    const coords = this.state.resolveEdge(cmd.from, cmd.to);
    if (!coords) {
      console.warn(
        `[DrawingEngine] edge: shape "${cmd.from}" or "${cmd.to}" not found yet`,
      );
      return;
    }

    const { x1, y1, x2, y2 } = coords;
    const dx = x2 - x1;
    const dy = y2 - y1;

    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: x1,
        y: y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: dx, y: dy },
          richText: toRichText(cmd.label ?? ""),
          color: toTlColor(cmd.color),
          size: "l",
          arrowheadEnd: "arrow",
          arrowheadStart: "none",
          font: "draw",
        },
      },
    ]);
  }

  private async drawNote(cmd: NoteCommand) {
    const pos = this.state.resolveNote(cmd.anchor, cmd.pos);
    if (!pos) {
      console.warn(`[DrawingEngine] note: anchor "${cmd.anchor}" not found`);
      return;
    }

    const id = createShapeId();
    const sid = this.state.nextAutoId();
    this.editor.createShapes([
      {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(""),
          size: (cmd.size ?? "m") as DrawSize,
          color: toTlColor(cmd.color ?? "grey"),
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
    this.state.register(sid, id, "", { label: cmd.text, shape: "text" });
    await this.animateRichText(id, cmd.text);
  }
}
