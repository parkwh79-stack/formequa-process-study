// Split a rectangular finish around vertical shaft openings without covering the shaft.
export function finishPatches(rect, openings = []) {
  return openings.reduce((pieces, hole) => pieces.flatMap(([x0, z0, x1, z1]) => {
    const a = Math.max(x0, hole[0]), b = Math.max(z0, hole[1]), c = Math.min(x1, hole[2]), d = Math.min(z1, hole[3]);
    if (a >= c || b >= d) return [[x0, z0, x1, z1]];
    return [[x0, z0, a, z1], [c, z0, x1, z1], [a, z0, c, b], [a, d, c, z1]].filter(r => r[2] - r[0] > 0.02 && r[3] - r[1] > 0.02);
  }), [rect]);
}
