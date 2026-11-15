import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ZoneId, ZoneStatus } from '../../core/health/model';
import { Sparkline } from '../../ui/Sparkline';
import { TierChip, tierStyle } from '../../ui/TierChip';

export interface AlertRailRow {
  id: ZoneId;
  label: string;
  status: ZoneStatus;
  note: string;
  /** The zone's primary indicator over the trend window, when the zone is monitored and has data. */
  spark: { label: string; values: number[]; baseline: number | null; last: string | null } | null;
}

/** How far (px) the middle of the arc bulges toward the body. */
export const ARC_DEPTH = 48;
/** Arc length (px) between two neighbouring cards. */
export const SLOT = 140;
/** Pointer travel (px) below which a press is a click, not a drag. */
const DRAG_THRESHOLD = 5;
const ALERTING: ReadonlySet<ZoneStatus> = new Set(['notice', 'caution', 'warning']);

export interface WheelGeometry {
  /** Circle radius. */
  r: number;
  /** Circle centre; x is negative (off to the left), y is the middle of the column. */
  cx: number;
  cy: number;
}

/**
 * The circle whose visible chord is the column: it touches x = 0 at the top and bottom of the column and
 * bulges to x = depth in the middle. r = ((h/2)^2 + depth^2) / (2 * depth).
 */
export function wheelGeometry(height: number, depth = ARC_DEPTH): WheelGeometry {
  const half = Math.max(height, 1) / 2;
  const r = (half * half + depth * depth) / (2 * depth);
  return { r, cx: depth - r, cy: half };
}

/** Where card `index` sits when the wheel is turned to `rotation` (the index currently at the centre). */
export function slotPosition(index: number, rotation: number, geo: WheelGeometry, slot = SLOT): { x: number; y: number; angle: number } {
  const angle = ((index - rotation) * slot) / geo.r;
  return { x: geo.cx + geo.r * Math.cos(angle), y: geo.cy + geo.r * Math.sin(angle), angle };
}

/** The wheel turns between the first and the last card being centred. */
export function clampRotation(rotation: number, count: number): number {
  return Math.min(Math.max(rotation, 0), Math.max(count - 1, 0));
}

const NARROW = '(max-width: 1100px)';
const REDUCED = '(prefers-reduced-motion: reduce)';
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
  );
}

function ZoneCard({ row, selected, onSelect }: { row: AlertRailRow; selected: boolean; onSelect(id: ZoneId): void }) {
  return (
    <button
      type="button"
      className="rail__item"
      aria-pressed={selected}
      data-zone-id={row.id}
      onClick={() => onSelect(row.id)}
    >
      <span className="rail__top">
        <span className="rail__name">{row.label}</span>
        <TierChip status={row.status} />
      </span>
      {row.spark ? (
        <span className="rail__metric">
          <Sparkline values={row.spark.values} baseline={row.spark.baseline} />
          <span className="rail__value">
            <span className="rail__metric-label">{row.spark.label}</span>
            <span className="mono">{row.spark.last ?? 'No reading'}</span>
          </span>
        </span>
      ) : null}
      <span className="rail__note">{row.note}</span>
    </button>
  );
}

interface Motion {
  current: number;
  target: number;
  height: number;
  raf: number;
  snapTimer: ReturnType<typeof setTimeout> | undefined;
  pointerId: number | null;
  startY: number;
  startTarget: number;
  dragged: boolean;
}

/**
 * The zone menu as a wheel: the six zones sit on a large circle whose visible arc curves toward the body.
 * Scrolling or dragging turns the wheel, so cards travel along the arc instead of sliding vertically; it
 * settles on the nearest card. Arrow keys and Tab turn it too, and picking an organ in the 3D body turns
 * the wheel to that zone. Positions are written straight to the DOM on each animation frame.
 */
function ZoneWheel({
  rows,
  selectedZoneId,
  onSelect,
}: {
  rows: readonly AlertRailRow[];
  selectedZoneId: ZoneId | null;
  onSelect(id: ZoneId): void;
}) {
  const reduced = useMedia(REDUCED);
  const list = useRef<HTMLUListElement>(null);
  const slots = useRef<Array<HTMLLIElement | null>>([]);
  const guide = useRef<SVGCircleElement>(null);
  const count = rows.length;
  const motion = useRef<Motion>({
    current: (count - 1) / 2,
    target: (count - 1) / 2,
    height: 0,
    raf: 0,
    snapTimer: undefined,
    pointerId: null,
    startY: 0,
    startTarget: 0,
    dragged: false,
  });

  /** Writes every card's position along the arc for the current rotation. */
  const paint = useCallback(() => {
    const m = motion.current;
    const geo = wheelGeometry(m.height);
    const half = m.height / 2;
    slots.current.forEach((el, i) => {
      if (!el) return;
      const { x, y } = slotPosition(i, m.current, geo);
      const distance = m.height > 0 ? Math.abs(y - half) / half : 0; // 0 centre, 1 edge
      const fade = Math.min(1, Math.max(0, (distance - 0.55) / 0.45));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`;
      el.style.width = `calc(100% - ${Math.max(0, x).toFixed(1)}px)`;
      el.style.opacity = String(1 - 0.75 * fade);
      el.style.visibility = m.height > 0 && distance > 1.35 ? 'hidden' : '';
      el.style.zIndex = String(100 - Math.round(distance * 50));
    });
    const c = guide.current;
    if (c) {
      c.setAttribute('cx', geo.cx.toFixed(1));
      c.setAttribute('cy', geo.cy.toFixed(1));
      c.setAttribute('r', geo.r.toFixed(1));
    }
  }, []);

  // One animation step: ease the wheel toward its target, then schedule the next step until it settles.
  // Kept in a ref so the frame callback can re-schedule itself.
  const loop = useRef<() => void>(() => {});
  useEffect(() => {
    loop.current = () => {
      const m = motion.current;
      const diff = m.target - m.current;
      m.current = Math.abs(diff) < 0.002 ? m.target : m.current + diff * 0.18;
      paint();
      m.raf = m.current === m.target ? 0 : requestAnimationFrame(() => loop.current());
    };
  }, [paint]);

  const turnTo = useCallback(
    (target: number, opts: { snap?: boolean } = {}) => {
      const m = motion.current;
      m.target = clampRotation(opts.snap ? Math.round(target) : target, count);
      if (reduced || typeof requestAnimationFrame === 'undefined') {
        m.current = m.target;
        paint();
        return;
      }
      if (!m.raf) m.raf = requestAnimationFrame(() => loop.current());
    },
    [count, reduced, paint],
  );

  const snapSoon = useCallback(() => {
    const m = motion.current;
    clearTimeout(m.snapTimer);
    m.snapTimer = setTimeout(() => turnTo(m.target, { snap: true }), 140);
  }, [turnTo]);

  // Track the column height: the circle is fitted to it.
  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const measure = () => {
      motion.current.height = ul.clientHeight;
      paint();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(ul);
    return () => observer.disconnect();
  }, [paint, count]);

  // Wheel / touchpad: turn instead of scrolling. Needs a non-passive listener to stop the page scroll.
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      turnTo(motion.current.target + px / SLOT);
      snapSoon();
    };
    ul.addEventListener('wheel', onWheel, { passive: false });
    return () => ul.removeEventListener('wheel', onWheel);
  }, [turnTo, snapSoon]);

  // Arrow keys on the page itself (nothing focused) turn the wheel one card. Any focused control, open
  // dialog or earlier handler keeps the key.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      turnTo(Math.round(motion.current.target) + step, { snap: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnTo]);

  // Selecting a zone (a tap on its card, or an organ in the 3D body) turns the wheel to bring it to the
  // centre. Only a real change of selection counts: rows are rebuilt on every session update, which must
  // not turn the wheel.
  const lastSelected = useRef(selectedZoneId);
  useEffect(() => {
    if (selectedZoneId === lastSelected.current) return;
    lastSelected.current = selectedZoneId;
    const i = rows.findIndex((r) => r.id === selectedZoneId);
    if (i >= 0) turnTo(i, { snap: true });
  }, [selectedZoneId, rows, turnTo]);

  useEffect(() => {
    const m = motion.current;
    return () => {
      cancelAnimationFrame(m.raf);
      clearTimeout(m.snapTimer);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.button !== 0) return;
    const m = motion.current;
    m.pointerId = e.pointerId;
    m.startY = e.clientY;
    m.startTarget = m.target;
    m.dragged = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    const m = motion.current;
    if (m.pointerId !== e.pointerId) return;
    const dy = e.clientY - m.startY;
    if (!m.dragged && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!m.dragged) {
      m.dragged = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add('is-dragging');
    }
    // Dragging down pulls the upper cards toward the centre: the wheel turns back.
    turnTo(m.startTarget - dy / SLOT);
  };
  const endDrag = (e: ReactPointerEvent<HTMLUListElement>) => {
    const m = motion.current;
    if (m.pointerId !== e.pointerId) return;
    m.pointerId = null;
    e.currentTarget.classList.remove('is-dragging');
    if (m.dragged) turnTo(m.target, { snap: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = slots.current.map((li) => li?.querySelector<HTMLButtonElement>('button') ?? null);
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at === -1) return;
    e.preventDefault();
    const next = Math.min(Math.max(at + (e.key === 'ArrowDown' ? 1 : -1), 0), count - 1);
    buttons[next]?.focus();
  };

  return (
    <ul
      className="rail rail--wheel"
      aria-label="Body zones"
      aria-describedby="rail-wheel-help"
      ref={list}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        // The click that ends a drag must not select the card under the pointer.
        if (motion.current.dragged) {
          e.stopPropagation();
          e.preventDefault();
          motion.current.dragged = false;
        }
      }}
      onKeyDown={onKeyDown}
    >
      <svg className="rail__arc" aria-hidden="true">
        <circle ref={guide} />
      </svg>
      {rows.map((row, i) => (
        <li
          key={row.id}
          className="rail__slot"
          style={tierStyle(row.status) as CSSProperties}
          ref={(el) => {
            slots.current[i] = el;
          }}
          onFocus={() => turnTo(i, { snap: true })}
        >
          <span className={`rail__dot${ALERTING.has(row.status) ? ' rail__dot--alert' : ''}`} aria-hidden="true" />
          <ZoneCard row={row} selected={row.id === selectedZoneId} onSelect={onSelect} />
        </li>
      ))}
      <span className="sr-only" id="rail-wheel-help">
        Scroll or drag to turn the wheel. Arrow keys move between zones.
      </span>
    </ul>
  );
}

/**
 * The zone menu: the six zones in fixed anatomical order. Wide screens show a wheel on a semicircle that
 * curves toward the body; narrow screens show a plain list. Either way it is a list of buttons in reading
 * order, so it is also the accessible fallback for any body renderer.
 */
export function AlertRail({
  rows,
  selectedZoneId,
  onSelect,
}: {
  rows: readonly AlertRailRow[];
  selectedZoneId: ZoneId | null;
  onSelect(id: ZoneId): void;
}) {
  const narrow = useMedia(NARROW);
  if (!narrow) return <ZoneWheel rows={rows} selectedZoneId={selectedZoneId} onSelect={onSelect} />;
  return (
    <ul className="rail" aria-label="Body zones">
      {rows.map((row) => (
        <li key={row.id} className="rail__slot" style={tierStyle(row.status)}>
          <ZoneCard row={row} selected={row.id === selectedZoneId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
