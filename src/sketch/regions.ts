import {
  boundaryPoints,
  type CurveSpan,
  curvePoint,
  regionTolerance,
  spanArea,
  spanCurvature,
  spanTangent,
  splitCurveSpans,
} from "./curve-spans.js";
import type { Curve } from "./document.js";
import { distance } from "./geometry.js";
import type { Point } from "./planes.js";

export function signedArea(points: readonly Point[]): number {
  return (
    points.reduce((area, point, i) => {
      const next = points[(i + 1) % points.length];
      return area + (next ? point.x * next.y - point.y * next.x : 0);
    }, 0) / 2
  );
}
interface DirectedSpan {
  span: CurveSpan;
  from: number;
  to: number;
  reverse: number;
}
function direction(span: CurveSpan): number {
  const tangent = spanTangent(span);
  const angle = (Math.atan2(tangent.y, tangent.x) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(angle, 2 * Math.PI - angle) < 1e-12 ? 0 : angle;
}
function compareExits(a: CurveSpan, b: CurveSpan): number {
  const delta = direction(a) - direction(b);
  // Tangent curves separate at second order. Their signed curvature decides
  // the radial order; using display chords here would make it zoom-dependent.
  return Math.abs(delta) > 1e-12 ? delta : spanCurvature(a) - spanCurvature(b);
}
function withoutTails(walk: number[], edges: DirectedSpan[]): number[] {
  const kept: number[] = [];
  for (const edge of walk) {
    if (kept.at(-1) === edges[edge].reverse) kept.pop();
    else kept.push(edge);
  }
  while (kept.length > 1 && kept[0] === edges[kept[kept.length - 1]].reverse) {
    kept.shift();
    kept.pop();
  }
  return kept;
}

/** Bounded faces of an analytic curve arrangement. Camera/tessellation is not input. */
export function closedBoundaries(input: readonly Curve[]): CurveSpan[][] {
  const vertices: Point[] = [],
    exits: number[][] = [],
    edges: DirectedSpan[] = [];
  const vertex = (point: Point) => {
    const found = vertices.findIndex((v) => distance(v, point) <= regionTolerance);
    if (found >= 0) return found;
    vertices.push(point);
    exits.push([]);
    return vertices.length - 1;
  };
  const duplicates = new Map<string, Point[]>();
  for (const span of splitCurveSpans(input)) {
    const from = vertex(curvePoint(span.curve, span.start)),
      to = vertex(curvePoint(span.curve, span.end));
    if (from === to) continue;
    const key = `${Math.min(from, to)}/${Math.max(from, to)}`;
    const middle = curvePoint(span.curve, (span.start + span.end) / 2);
    const existing = duplicates.get(key) ?? [];
    if (existing.some((point) => distance(point, middle) <= regionTolerance)) continue;
    duplicates.set(key, [...existing, middle]);
    const index = edges.length;
    edges.push(
      { span, from, to, reverse: index + 1 },
      {
        span: { ...span, start: span.end, end: span.start },
        from: to,
        to: from,
        reverse: index,
      },
    );
    exits[from].push(index);
    exits[to].push(index + 1);
  }
  for (const list of exits) list.sort((a, b) => compareExits(edges[a].span, edges[b].span));
  return walkBoundaries(edges, exits);
}
function walkBoundaries(edges: DirectedSpan[], exits: number[][]): CurveSpan[][] {
  const visited = new Set<number>(),
    boundaries: CurveSpan[][] = [];
  for (let start = 0; start < edges.length; start++) {
    if (visited.has(start)) continue;
    const walk: number[] = [];
    let index = start;
    do {
      visited.add(index);
      walk.push(index);
      const edge = edges[index],
        next = exits[edge.to];
      const reverse = next.indexOf(edge.reverse);
      index = next[(reverse + next.length - 1) % next.length];
    } while (index !== start && !visited.has(index));
    if (index !== start) throw new Error("Region boundary did not close");
    const boundary = withoutTails(walk, edges).map((i) => edges[i].span);
    if (boundary.reduce((sum, span) => sum + spanArea(span), 0) > regionTolerance ** 2)
      boundaries.push(boundary);
  }
  return boundaries;
}

/** Display polygons for existing callers; connectivity is always analytic. */
export function closedCells(input: readonly Curve[], unitsPerPixel = 0.05): Point[][] {
  return closedBoundaries(input).map((boundary) => boundaryPoints(boundary, unitsPerPixel));
}
