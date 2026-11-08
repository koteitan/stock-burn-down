import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  actualPoints,
  countTicks,
  chartEnd,
  dateTicks,
  dayOfTime,
  expiryPoints,
  expiryUnits,
  recordsSince,
  type CategoryFilter,
  type ChartPoint,
} from '../chart';
import { formatDate, fromDay } from '../date';
import type { Lists } from '../types';

const HEIGHT = 240;
const M = { top: 22, right: 16, bottom: 26, left: 34 };
const LABEL_FONT = 10;
const VALUE_FONT = 12;

interface Named {
  name: string;
  units: number;
}

interface Group {
  day: number;
  /** Stock if consumed at best-before dates. */
  expiry: number;
  /** Actual stock; null for future days. */
  actual: number | null;
  expiring: Named[];
  eaten: Named[];
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? size : size * 0.6;
  return w;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Liang–Barsky: does the segment (ax,ay)-(bx,by) pass through the box? */
function segmentHitsBox(ax: number, ay: number, bx: number, by: number, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) return false;
      t1 = Math.min(t1, r);
    }
    return true;
  };
  const dx = bx - ax;
  const dy = by - ay;
  return clip(-dx, ax - b.x0) && clip(dx, b.x1 - ax) && clip(-dy, ay - b.y0) && clip(dy, b.y1 - ay);
}

/**
 * Label baselines tried around a point, as [right side?, dy]. The lines fall to the lower
 * right, so above-right and below-left come first.
 */
const LABEL_SPOTS: [boolean, number][] = [
  [true, -5],
  [false, 14],
  [true, 4],
  [false, 4],
  [true, 14],
  [false, -5],
  [true, -16],
  [false, -16],
];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface ChartProps {
  /** A category, or null for the overall chart of all categories. */
  category: CategoryFilter;
  /** Name shown for the chart (category name or "overall"). */
  title: string;
  lists: Lists;
  goal: number | null;
  /** Chart range start day. */
  start: number;
  /** Chart range end day, or null for the last best-before date. */
  end: number | null;
  /** Current time as a fractional day. */
  now: number;
}

export function BurnDownChart(props: ChartProps) {
  const [ref, width] = useWidth();
  return (
    <div className="chart-plot" ref={ref}>
      {width > 0 && <ChartBody {...props} width={width} />}
    </div>
  );
}

function tally(names: string[]): Named[] {
  const out: Named[] = [];
  for (const name of names) {
    const hit = out.find((n) => n.name === name);
    if (hit) hit.units++;
    else out.push({ name, units: 1 });
  }
  return out;
}

const path = (pts: ChartPoint[], x: (v: number) => number, y: (v: number) => number) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x)},${y(p.value)}`).join('');

export function ChartBody(props: ChartProps & { width: number }) {
  const { category, title, lists, goal, start, end, now, width } = props;
  const clipId = useId();
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const today = Math.floor(now);

  const units = useMemo(
    () => expiryUnits(lists.stocks, lists.history, category, start),
    [lists.stocks, lists.history, category, start],
  );
  const records = useMemo(
    () => recordsSince(lists.history, category, start),
    [lists.history, category, start],
  );
  const expiry = useMemo(() => expiryPoints(units, start), [units, start]);
  // The visible range is [start, last + 1): the whole last day is shown.
  const last = chartEnd(start, end, units, today) + 1;
  const visible = (day: number) => day >= start && day < last;
  const actual = useMemo(
    () => actualPoints(lists.history, category, start, now, units.length),
    [lists.history, category, start, now, units.length],
  );
  const n = units.length;
  const stockNow = actual[actual.length - 1].value;

  const groups = useMemo(() => {
    const days = new Set<number>([start, today]);
    for (const u of units) days.add(u.day);
    for (const r of records) days.add(Math.floor(dayOfTime(r.at)));
    const name = (item: { category: string; content: string }) =>
      item.content.trim() || item.category || t('noCategory');
    return [...days]
      .filter(visible)
      .sort((a, b) => a - b)
      .map((day): Group => ({
        day,
        expiry: n - units.filter((u) => u.day <= day).length,
        actual:
          day > today
            ? null
            : n -
              records
                .filter((r) => Math.floor(dayOfTime(r.at)) <= day)
                .reduce((sum, r) => sum + r.count, 0),
        expiring: tally(units.filter((u) => u.day === day).map((u) => name(u))),
        eaten: tally(
          records
            .filter((r) => Math.floor(dayOfTime(r.at)) === day)
            .flatMap((r) => Array<string>(r.count).fill(name(r))),
        ),
      }));
  }, [units, records, start, last, today, n, t]);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;

  const pad = Math.max(0.2, (last - start) * 0.03);
  const minX = start - pad;
  const maxX = last + pad;
  const x = (day: number) => M.left + ((day - minX) / (maxX - minX)) * plotW;

  const yTicks = countTicks(Math.max(n, goal ?? 0, 1));
  const yMax = yTicks[yTicks.length - 1];
  const y = (v: number) => M.top + (1 - v / yMax) * plotH;

  const xTicks = dateTicks(start, last - 1, Math.max(2, Math.floor(plotW / 64)));
  const showToday = visible(now);

  // When one unit is too short for a dot, a run of same-x points shows dots only at its ends.
  const dense = plotH / yMax < 10;
  const dots = (pts: ChartPoint[]) =>
    pts.filter((p, i) => !dense || i === 0 || pts[i - 1].x !== p.x || pts[i + 1]?.x !== p.x);

  const lastActual = actual[actual.length - 1];
  const valueW = textWidth(String(stockNow), VALUE_FONT);
  const valueRight = x(lastActual.x) + 6 + valueW <= width - 2;
  const valueLabel = {
    x: valueRight ? x(lastActual.x) + 6 : x(lastActual.x) - 6,
    y: y(lastActual.value) - 8,
    anchor: valueRight ? ('start' as const) : ('end' as const),
  };

  const labels = (() => {
    const placed: Box[] = [];
    const out: { x: number; y: number; text: string; anchor: 'start' | 'end' }[] = [];
    placed.push({
      x0: valueRight ? valueLabel.x : valueLabel.x - valueW,
      x1: valueRight ? valueLabel.x + valueW : valueLabel.x,
      y0: valueLabel.y - VALUE_FONT,
      y1: valueLabel.y + 2,
    });
    const todayW = textWidth(t('chart.today'), LABEL_FONT);
    placed.push({ x0: x(now) - 4 - todayW, x1: x(now) - 4, y0: 0, y1: M.top - 6 });
    if (goal !== null) {
      placed.push({ x0: M.left, x1: M.left + plotW, y0: y(goal) - 1, y1: y(goal) + 1 });
    }
    for (const v of yTicks) placed.push({ x0: 0, x1: M.left - 4, y0: y(v) - 6, y1: y(v) + 5 });
    const segments: number[][] = [];
    for (const pts of [expiry, actual]) {
      for (let i = 1; i < pts.length; i++) {
        segments.push([x(pts[i - 1].x), y(pts[i - 1].value), x(pts[i].x), y(pts[i].value)]);
      }
    }
    segments.push([x(now), M.top, x(now), y(0)]);
    for (const p of expiry) {
      if (!p.label || !visible(p.x)) continue;
      const w = textWidth(p.label, LABEL_FONT);
      const px = x(p.x);
      const py = y(p.value);
      type Spot = { box: Box; lx: number; ly: number; right: boolean };
      let fallback: Spot | null = null;
      let chosen: Spot | null = null;
      for (const [right, dy] of LABEL_SPOTS) {
        const lx = right ? px + 7 : px - 7;
        const ly = py + dy;
        const box = {
          x0: right ? lx : lx - w,
          x1: right ? lx + w : lx,
          y0: ly - LABEL_FONT,
          y1: ly + 2,
        };
        if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || box.y1 > y(0)) continue;
        if (placed.some((b) => overlaps(b, box))) continue;
        const spot = { box, lx, ly, right };
        fallback ??= spot;
        if (!segments.some(([ax, ay, bx, by]) => segmentHitsBox(ax, ay, bx, by, box))) {
          chosen = spot;
          break;
        }
      }
      chosen ??= fallback;
      if (!chosen) continue;
      placed.push(chosen.box);
      out.push({
        x: chosen.lx,
        y: chosen.ly,
        text: p.label,
        anchor: chosen.right ? 'start' : 'end',
      });
    }
    return out;
  })();

  const nearestGroup = (px: number) => {
    let best = 0;
    for (let i = 1; i < groups.length; i++) {
      if (Math.abs(x(groups[i].day) - px) < Math.abs(x(groups[best].day) - px)) best = i;
    }
    return best;
  };

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setActive(nearestGroup(e.clientX - rect.left));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((a) => Math.min(groups.length - 1, Math.max(0, (a ?? 0) + step)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const g = active !== null ? groups[Math.min(active, groups.length - 1)] : null;
  const tipLeft = g ? x(g.day) : 0;
  const tipOnLeft = tipLeft > width / 2;
  // Narrow charts have no room beside the crosshair, so pin the tooltip to the far side.
  const tipStyle =
    width >= 480
      ? tipOnLeft
        ? { right: width - tipLeft + 10, top: M.top }
        : { left: tipLeft + 10, top: M.top }
      : tipOnLeft
        ? { left: M.left, top: M.top }
        : { right: 0, top: M.top };

  return (
    <>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t('chart.aria', {
          category: title,
          n: stockNow,
        })}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? 0)}
        onBlur={() => setActive(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} />
            <text className="tick" x={M.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <line className="axis" x1={M.left} x2={M.left + plotW} y1={y(0)} y2={y(0)} />
        {xTicks.map((tk) => (
          <text key={tk.day} className="tick" x={x(tk.day)} y={HEIGHT - 8} textAnchor="middle">
            {tk.label}
          </text>
        ))}

        {showToday && (
          <>
            <line className="today" x1={x(now)} x2={x(now)} y1={M.top} y2={y(0)} />
            <text className="today-label" x={x(now) - 4} y={M.top - 8} textAnchor="end">
              {t('chart.today')}
            </text>
          </>
        )}

        <defs>
          <clipPath id={clipId}>
            <rect x={x(start) - 6} y={0} width={x(last) - x(start) + 12} height={y(0) + 6} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {goal !== null && (
            <line
              className="target-line"
              x1={M.left}
              x2={M.left + plotW}
              y1={y(goal)}
              y2={y(goal)}
            />
          )}
          <path className="expiry-line" d={path(expiry, x, y)} />
          <path className="actual-line" d={path(actual, x, y)} />
          {dots(expiry).map((p, i) => (
            <circle key={`e${i}`} className="expiry-dot" cx={x(p.x)} cy={y(p.value)} r={3.5} />
          ))}
          {dots(actual).map((p, i) => (
            <circle key={`a${i}`} className="actual-dot" cx={x(p.x)} cy={y(p.value)} r={4} />
          ))}
        </g>

        {visible(lastActual.x) && (
          <text
            className="value-label"
            x={valueLabel.x}
            y={valueLabel.y}
            textAnchor={valueLabel.anchor}
          >
            {stockNow}
          </text>
        )}
        {labels.map((l, i) => (
          <text key={i} className="point-label" x={l.x} y={l.y} textAnchor={l.anchor}>
            {l.text}
          </text>
        ))}

        {g && (
          <line
            className="crosshair"
            x1={x(g.day)}
            x2={x(g.day)}
            y1={M.top}
            y2={y(0)}
            pointerEvents="none"
          />
        )}

        <rect
          x={M.left}
          y={0}
          width={plotW}
          height={HEIGHT}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null);
          }}
        />
      </svg>
      {g && (
        <div className="tooltip" style={tipStyle}>
          <div className="tooltip-date">
            {formatDate(fromDay(g.day))}
            {g.day === today && ` (${t('chart.today')})`}
          </div>
          {g.actual !== null && (
            <div className="tooltip-row">
              <span className="key key-actual" />
              <strong>{g.actual}</strong>
              <span>{t('chart.actual')}</span>
            </div>
          )}
          <div className="tooltip-row">
            <span className="key key-expiry" />
            <strong>{g.expiry}</strong>
            <span>{t('chart.expiry')}</span>
          </div>
          {goal !== null && (
            <div className="tooltip-row">
              <span className="key key-target" />
              <strong>{goal}</strong>
              <span>{t('chart.target')}</span>
            </div>
          )}
          {g.expiring.length > 0 && (
            <div className="tooltip-item">
              {t('chart.expiring')}: {g.expiring.map((n) => `${n.name} ×${n.units}`).join(', ')}
            </div>
          )}
          {g.eaten.length > 0 && (
            <div className="tooltip-item">
              {t('chart.eaten')}: {g.eaten.map((n) => `${n.name} ×${n.units}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </>
  );
}
