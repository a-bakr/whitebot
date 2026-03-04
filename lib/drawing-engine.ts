import type {
  ArrowCommand,
  BarChartCommand,
  BulletCommand,
  CircleCommand,
  CircleEmCommand,
  DrawColor,
  DrawCommand,
  DrawSize,
  EdgeCommand,
  HighlightCommand,
  LineChartCommand,
  LineCommand,
  NodeCommand,
  NoteCommand,
  ProgressCommand,
  RectCommand,
  SectionCommand,
  SketchArrowCommand,
  TableCommand,
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

  async executeCommand(cmd: DrawCommand, animationBudgetMs?: number) {
    switch (cmd.cmd) {
      case "clear":
        this.clear();
        break;
      case "title":
        await this.drawTitle(cmd, animationBudgetMs);
        break;
      case "text":
        await this.drawText(cmd, animationBudgetMs);
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
        await this.drawBullet(cmd, animationBudgetMs);
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
        await this.drawNode(cmd);
        break;
      case "edge":
        await this.drawEdge(cmd);
        break;
      case "note":
        await this.drawNote(cmd, animationBudgetMs);
        break;
      // ── Data visualization commands ───────────────────────────────────
      case "bar-chart":
        await this.drawBarChart(cmd, animationBudgetMs);
        break;
      case "line-chart":
        await this.drawLineChart(cmd, animationBudgetMs);
        break;
      case "table":
        await this.drawTable(cmd, animationBudgetMs);
        break;
      case "progress":
        await this.drawProgress(cmd);
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

  /**
   * Typewriter animation with optional duration budget from audio sync.
   * When budgetMs is provided, the animation stretches to fill the time:
   *   30% pre-delay (teacher speaks first) → 50% typewriter → 20% hold.
   * Without a budget, uses the default 22ms/char.
   */
  private async animateRichText(
    id: TLShapeId,
    fullText: string,
    budgetMs?: number,
  ) {
    let charDelay = 22;
    let preDelay = 0;

    if (budgetMs && budgetMs > 200 && fullText.length > 0) {
      preDelay = Math.round(budgetMs * 0.3);
      const typewriterBudget = budgetMs * 0.5;
      // Clamp between 15ms (fast) and 80ms (slow, dramatic) per char
      charDelay = Math.max(
        15,
        Math.min(80, Math.round(typewriterBudget / fullText.length)),
      );
    }

    if (preDelay > 0) await sleep(preDelay);

    let current = "";
    for (const char of fullText) {
      current += char;
      this.editor.updateShapes([
        { id, type: "text", props: { richText: toRichText(current) } },
      ]);
      await sleep(charDelay);
    }
  }

  // ── Legacy coordinate-based draw methods (collision-guarded) ─────────────

  private async drawTitle(cmd: TitleCommand, budgetMs?: number) {
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
    await this.animateRichText(id, cmd.text, budgetMs);
  }

  private async drawText(cmd: TextCommand, budgetMs?: number) {
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
    await this.animateRichText(id, cmd.text, budgetMs);
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

  private async drawBullet(cmd: BulletCommand, budgetMs?: number) {
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
    await this.animateRichText(id, `• ${cmd.text}`, budgetMs);
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

  // ── Node grow-from-center animation helper ─────────────────────────────────

  /**
   * Animate a geo shape growing from a 2×2 seed at the slot centre to its
   * full size using an ease-out cubic curve (~200 ms, 14 frames at 16 ms).
   */
  private async animateGeoGrow(
    id: TLShapeId,
    cx: number,
    cy: number,
    targetW: number,
    targetH: number,
  ) {
    const STEPS = 14;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      // ease-out cubic: starts fast, decelerates to rest
      const e = 1 - Math.pow(1 - t, 3);
      const w = Math.max(2, targetW * e);
      const h = Math.max(2, targetH * e);
      this.editor.updateShapes([
        { id, type: "geo", x: cx - w / 2, y: cy - h / 2, props: { w, h } },
      ]);
      await sleep(16);
    }
  }

  private async drawNode(cmd: NodeCommand) {
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
    const cx = safe.x + safe.w / 2;
    const cy = safe.y + safe.h / 2;

    switch (cmd.shape) {
      case "circle": {
        const r = Math.round(Math.min(safe.w, safe.h) / 2);
        // Seed at centre, grow to full radius
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: cx - 1,
            y: cy - 1,
            props: {
              geo: "ellipse",
              w: 2,
              h: 2,
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
        await this.animateGeoGrow(id, cx, cy, r * 2, r * 2);
        break;
      }
      case "diamond": {
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: cx - 1,
            y: cy - 1,
            props: {
              geo: "diamond",
              w: 2,
              h: 2,
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
        await this.animateGeoGrow(id, cx, cy, safe.w, safe.h);
        break;
      }
      case "text": {
        // Text nodes appear instantly (no geo to animate)
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
        // rect (default) — grow from centre
        this.editor.createShapes([
          {
            id,
            type: "geo",
            x: cx - 1,
            y: cy - 1,
            props: {
              geo: "rectangle",
              w: 2,
              h: 2,
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
        await this.animateGeoGrow(id, cx, cy, safe.w, safe.h);
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

  private async drawEdge(cmd: EdgeCommand) {
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
    const id = createShapeId();

    // Start with zero-length arrow, then animate to full length
    this.editor.createShapes([
      {
        id,
        type: "arrow",
        x: x1,
        y: y1,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          richText: toRichText(""),
          color: toTlColor(cmd.color),
          size: "l",
          arrowheadEnd: "arrow",
          arrowheadStart: "none",
          font: "draw",
        },
      },
    ]);

    const STEPS = 18;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      this.editor.updateShapes([
        { id, type: "arrow", props: { end: { x: dx * t, y: dy * t } } },
      ]);
      await sleep(16);
    }

    // Add label after animation completes
    if (cmd.label) {
      this.editor.updateShapes([
        { id, type: "arrow", props: { richText: toRichText(cmd.label) } },
      ]);
    }
  }

  private async drawNote(cmd: NoteCommand, budgetMs?: number) {
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
    await this.animateRichText(id, cmd.text, budgetMs);
  }

  // ── Data visualization commands ───────────────────────────────────────────

  /**
   * Bar chart rendered as tldraw primitives with animated growing bars.
   *
   * Layout (all coordinates in page space):
   *   - Optional title text above the chart area
   *   - Y-axis (vertical line) on the left
   *   - X-axis (horizontal line) along the bottom
   *   - One geo rectangle per bar, animated from h=0 upward
   *   - X-axis label below each bar; value label above each bar
   */
  private async drawBarChart(cmd: BarChartCommand, budgetMs?: number) {
    const { x, y, w, h, labels, values, colors, unit, title } = cmd;
    if (!labels.length || !values.length) return;

    const n = Math.min(labels.length, values.length);
    const maxVal = Math.max(...values.slice(0, n), 1);

    const LABEL_H = 28; // space below x-axis for x labels
    const TITLE_H = title ? 36 : 0;
    const AXIS_W = 44; // space left of y-axis for (implicit) scale
    const chartH = h - LABEL_H - TITLE_H;
    const chartW = w - AXIS_W;
    const originX = x + AXIS_W;
    const originY = y + TITLE_H + chartH;

    const BAR_COLORS: DrawColor[] = [
      "blue",
      "green",
      "orange",
      "red",
      "violet",
      "light-blue",
      "light-green",
    ];

    // Optional title
    if (title) {
      const titleId = createShapeId();
      const sid = this.state.nextAutoId();
      this.editor.createShapes([
        {
          id: titleId,
          type: "text",
          x: x + w / 2 - 120,
          y,
          props: {
            richText: toRichText(""),
            size: "l" as DrawSize,
            color: "black" as DrawColor,
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);
      this.state.register(sid, titleId, "", { label: title, shape: "title" });
      await this.animateRichText(titleId, title, budgetMs ? Math.round(budgetMs * 0.15) : undefined);
    }

    // Y-axis
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: originX,
        y: y + TITLE_H,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: chartH },
          color: "black" as DrawColor,
          size: "m",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);

    // X-axis
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: originX,
        y: originY,
        props: {
          start: { x: 0, y: 0 },
          end: { x: chartW, y: 0 },
          color: "black" as DrawColor,
          size: "m",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);

    // Bars — animated growing from bottom
    const slotW = chartW / n;
    const barW = Math.max(20, Math.round(slotW * 0.55));
    const BAR_STEPS = 20;

    for (let i = 0; i < n; i++) {
      const targetH = Math.max(2, Math.round((values[i] / maxVal) * chartH));
      const bx = originX + i * slotW + (slotW - barW) / 2;
      const color: DrawColor =
        colors?.[i] ?? BAR_COLORS[i % BAR_COLORS.length];

      // Create bar seeded at height=2
      const barId = createShapeId();
      this.editor.createShapes([
        {
          id: barId,
          type: "geo",
          x: bx,
          y: originY - 2,
          props: {
            geo: "rectangle",
            w: barW,
            h: 2,
            color,
            fill: "semi",
            size: "m",
          },
        },
      ]);

      // Grow upward
      for (let s = 1; s <= BAR_STEPS; s++) {
        const t = s / BAR_STEPS;
        const e = 1 - Math.pow(1 - t, 2); // ease-out quadratic
        const curH = Math.max(2, Math.round(targetH * e));
        this.editor.updateShapes([
          { id: barId, type: "geo", y: originY - curH, props: { h: curH } },
        ]);
        await sleep(16);
      }

      // X-axis label below bar
      this.editor.createShapes([
        {
          id: createShapeId(),
          type: "text",
          x: bx,
          y: originY + 4,
          props: {
            richText: toRichText(labels[i]),
            size: "s" as DrawSize,
            color: "black" as DrawColor,
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);

      // Value label above bar
      const displayVal = unit ? `${values[i]}${unit}` : String(values[i]);
      this.editor.createShapes([
        {
          id: createShapeId(),
          type: "text",
          x: bx,
          y: originY - targetH - 26,
          props: {
            richText: toRichText(displayVal),
            size: "s" as DrawSize,
            color: toTlColor(color),
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);
    }
  }

  /**
   * Line chart drawn as tldraw primitives with the line revealed progressively
   * left-to-right.
   *
   * Layout:
   *   - Optional title above the chart
   *   - Y-axis + X-axis drawn first
   *   - Data point markers (small circles) placed at each coordinate
   *   - Connecting arrow segments animated one at a time from left to right
   *   - X-axis label below each data point
   */
  private async drawLineChart(cmd: LineChartCommand, budgetMs?: number) {
    const { x, y, w, h, labels, values, color, unit, title } = cmd;
    if (!labels.length || !values.length) return;

    const n = Math.min(labels.length, values.length);
    const minVal = Math.min(...values.slice(0, n));
    const maxVal = Math.max(...values.slice(0, n), minVal + 1);

    const LABEL_H = 28;
    const TITLE_H = title ? 36 : 0;
    const AXIS_W = 44;
    const chartH = h - LABEL_H - TITLE_H;
    const chartW = w - AXIS_W;
    const originX = x + AXIS_W;
    const originY = y + TITLE_H + chartH;
    const lineColor: DrawColor = toTlColor(color);

    // Optional title
    if (title) {
      const titleId = createShapeId();
      const sid = this.state.nextAutoId();
      this.editor.createShapes([
        {
          id: titleId,
          type: "text",
          x: x + w / 2 - 120,
          y,
          props: {
            richText: toRichText(""),
            size: "l" as DrawSize,
            color: "black" as DrawColor,
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);
      this.state.register(sid, titleId, "", { label: title, shape: "title" });
      await this.animateRichText(titleId, title, budgetMs ? Math.round(budgetMs * 0.15) : undefined);
    }

    // Y-axis
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: originX,
        y: y + TITLE_H,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: chartH },
          color: "black" as DrawColor,
          size: "m",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);

    // X-axis
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "arrow",
        x: originX,
        y: originY,
        props: {
          start: { x: 0, y: 0 },
          end: { x: chartW, y: 0 },
          color: "black" as DrawColor,
          size: "m",
          arrowheadEnd: "none",
          arrowheadStart: "none",
        },
      },
    ]);

    // Compute pixel coordinates for each data point
    const pts = values.slice(0, n).map((v, i) => ({
      px: originX + Math.round((i / (n - 1 || 1)) * chartW),
      py: originY - Math.round(((v - minVal) / (maxVal - minVal)) * chartH),
    }));

    // Draw connecting segments animated, then place markers + labels
    const SEG_STEPS = 16;
    for (let i = 0; i < n - 1; i++) {
      const { px: ax, py: ay } = pts[i];
      const { px: bx, py: by } = pts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const segId = createShapeId();

      this.editor.createShapes([
        {
          id: segId,
          type: "arrow",
          x: ax,
          y: ay,
          props: {
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: lineColor,
            size: "l",
            dash: "draw",
            arrowheadEnd: "none",
            arrowheadStart: "none",
          },
        },
      ]);

      for (let s = 1; s <= SEG_STEPS; s++) {
        const t = s / SEG_STEPS;
        this.editor.updateShapes([
          { id: segId, type: "arrow", props: { end: { x: dx * t, y: dy * t } } },
        ]);
        await sleep(12);
      }
    }

    // Data point markers + labels (placed after all lines are drawn)
    for (let i = 0; i < n; i++) {
      const { px, py } = pts[i];

      // Small filled circle marker
      this.editor.createShapes([
        {
          id: createShapeId(),
          type: "geo",
          x: px - 5,
          y: py - 5,
          props: {
            geo: "ellipse",
            w: 10,
            h: 10,
            color: lineColor,
            fill: "solid",
            size: "s",
          },
        },
      ]);

      // X-axis label
      this.editor.createShapes([
        {
          id: createShapeId(),
          type: "text",
          x: px - 20,
          y: originY + 4,
          props: {
            richText: toRichText(labels[i]),
            size: "s" as DrawSize,
            color: "black" as DrawColor,
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);

      // Value label above marker
      const displayVal = unit ? `${values[i]}${unit}` : String(values[i]);
      this.editor.createShapes([
        {
          id: createShapeId(),
          type: "text",
          x: px - 15,
          y: py - 26,
          props: {
            richText: toRichText(displayVal),
            size: "s" as DrawSize,
            color: lineColor,
            font: "draw",
            textAlign: "middle",
            autoSize: true,
          },
        },
      ]);
    }
  }

  /**
   * Structured data table.
   *
   * Header row uses a filled (semi) geo rectangle in the requested color.
   * Data rows use outlined rectangles.
   * Text is created in the centre of each cell.
   *
   * Row height is 40 px; columns are evenly distributed across `w`.
   */
  private async drawTable(cmd: TableCommand, budgetMs?: number) {
    const { x, y, w, headers, rows, color } = cmd;
    if (!headers.length) return;

    const CELL_H = 40;
    const cellW = Math.floor(w / headers.length);
    const headerColor: DrawColor = toTlColor(color ?? "blue");

    // Header row
    for (let c = 0; c < headers.length; c++) {
      const cx = x + c * cellW;
      const cellId = createShapeId();
      this.editor.createShapes([
        {
          id: cellId,
          type: "geo",
          x: cx,
          y,
          props: {
            geo: "rectangle",
            w: cellW,
            h: CELL_H,
            richText: toRichText(headers[c]),
            color: headerColor,
            fill: "semi",
            size: "m",
            font: "draw",
            align: "middle",
            verticalAlign: "middle",
          },
        },
      ]);
    }

    // Data rows — stagger appearance for a reveal effect
    for (let r = 0; r < rows.length; r++) {
      const ry = y + (r + 1) * CELL_H;
      await sleep(80); // brief pause between rows for readability
      for (let c = 0; c < headers.length; c++) {
        const cx = x + c * cellW;
        const cellText = rows[r]?.[c] ?? "";
        this.editor.createShapes([
          {
            id: createShapeId(),
            type: "geo",
            x: cx,
            y: ry,
            props: {
              geo: "rectangle",
              w: cellW,
              h: CELL_H,
              richText: toRichText(cellText),
              color: "black" as DrawColor,
              fill: "none",
              size: "m",
              font: "draw",
              align: "middle",
              verticalAlign: "middle",
            },
          },
        ]);
      }
    }
  }

  /**
   * Animated horizontal progress bar (value 0–100).
   *
   * Draws a grey outline track, then fills it with an animated colored bar
   * from left to right.  An optional label + percentage is shown to the right.
   */
  private async drawProgress(cmd: ProgressCommand) {
    const { x, y, w, h, value, label, color } = cmd;
    const clampedVal = Math.max(0, Math.min(100, value));
    const fillW = Math.round(w * (clampedVal / 100));
    const trackColor: DrawColor = "grey";
    const fillColor: DrawColor = toTlColor(color ?? "blue");

    // Background track
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "geo",
        x,
        y,
        props: {
          geo: "rectangle",
          w,
          h,
          color: trackColor,
          fill: "none",
          size: "m",
        },
      },
    ]);

    // Animated fill
    const PAD = 3;
    const fillId = createShapeId();
    this.editor.createShapes([
      {
        id: fillId,
        type: "geo",
        x: x + PAD,
        y: y + PAD,
        props: {
          geo: "rectangle",
          w: 2,
          h: h - PAD * 2,
          color: fillColor,
          fill: "semi",
          size: "m",
        },
      },
    ]);

    const STEPS = 30;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const e = 1 - Math.pow(1 - t, 2); // ease-out quadratic
      const curW = Math.max(2, Math.round((fillW - PAD * 2) * e));
      this.editor.updateShapes([
        { id: fillId, type: "geo", props: { w: curW } },
      ]);
      await sleep(16);
    }

    // Label to the right
    const displayText = label ? `${label}: ${clampedVal}%` : `${clampedVal}%`;
    this.editor.createShapes([
      {
        id: createShapeId(),
        type: "text",
        x: x + w + 12,
        y: y + h / 2 - 14,
        props: {
          richText: toRichText(displayText),
          size: "m" as DrawSize,
          color: fillColor,
          font: "draw",
          textAlign: "start",
          autoSize: true,
        },
      },
    ]);
  }
}
