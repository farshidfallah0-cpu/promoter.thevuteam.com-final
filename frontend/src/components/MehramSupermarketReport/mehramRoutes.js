/*
 * Route suggestions for the weekly plan. Pure geometry, no network: stores are split per city into
 * compact groups of `size` (seed = the store farthest from the city's centre, group = its nearest
 * unassigned neighbours, so the groups peel off from the edge inwards and never leave strays behind),
 * then each group is ordered into a short open path (nearest-neighbour + 2-opt).
 */
const R = Math.PI / 180;
const km = (a, b) => {
  const x = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lng - a.lng) * R) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const pathLen = (p) => p.reduce((s, x, i) => (i ? s + km(p[i - 1], x) : s), 0);

const orderPath = (pts) => {
  if (pts.length < 3) return [...pts];
  const c = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  const left = [...pts];
  let cur = left.splice(left.indexOf(left.reduce((b, p) => (km(p, c) > km(b, c) ? p : b))), 1)[0];
  const path = [cur];
  while (left.length) {
    let bi = 0;
    left.forEach((p, i) => { if (km(cur, p) < km(cur, left[bi])) bi = i; });
    cur = left.splice(bi, 1)[0];
    path.push(cur);
  }
  // 2-opt on the open path until no reversal shortens it.
  for (let improved = true, guard = 0; improved && guard < 50; guard += 1) {
    improved = false;
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let j = i + 1; j < path.length; j += 1) {
        const before = (i > 0 ? km(path[i - 1], path[i]) : 0) + (j < path.length - 1 ? km(path[j], path[j + 1]) : 0);
        const after = (i > 0 ? km(path[i - 1], path[j]) : 0) + (j < path.length - 1 ? km(path[i], path[j + 1]) : 0);
        if (after < before - 1e-9) { path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse()); improved = true; }
      }
    }
  }
  return path;
};

/**
 * Same short-path idea, but the stops in `prefix` (ids, in the order the user picked them) are fixed at the front and
 * the rest is re-chained from the last picked stop: nearest-neighbour from there, then 2-opt on the free tail only.
 */
const orderPathFrom = (pts, prefix) => {
  const byId = new Map(pts.map((p) => [p.id, p]));
  const head = prefix.map((id) => byId.get(id)).filter(Boolean);
  if (!head.length) return orderPath(pts);
  const left = pts.filter((p) => !head.includes(p));
  const path = [head[head.length - 1]];
  let cur = path[0];
  while (left.length) {
    let bi = 0;
    left.forEach((p, i) => { if (km(cur, p) < km(cur, left[bi])) bi = i; });
    cur = left.splice(bi, 1)[0];
    path.push(cur);
  }
  for (let improved = true, guard = 0; improved && guard < 50; guard += 1) {
    improved = false;
    for (let i = 1; i < path.length - 1; i += 1) { // index 0 = the last picked stop, never moves
      for (let j = i + 1; j < path.length; j += 1) {
        const before = km(path[i - 1], path[i]) + (j < path.length - 1 ? km(path[j], path[j + 1]) : 0);
        const after = km(path[i - 1], path[j]) + (j < path.length - 1 ? km(path[i], path[j + 1]) : 0);
        if (after < before - 1e-9) { path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse()); improved = true; }
      }
    }
  }
  return [...head.slice(0, -1), ...path];
};

/**
 * stores: [{ id, city, lat, lng, ... }] → [{ city, stops: [store…ordered], km, pinned }]
 * pins: store ids the user fixed, in click order; inside each group they open the route in that order and the rest follows from the last one.
 */
export const suggestRoutes = (stores, size, pins = []) => {
  const byCity = {};
  stores.forEach((s) => { (byCity[s.city] ||= []).push(s); });
  const groups = [];
  Object.entries(byCity).forEach(([city, list]) => {
    const centre = { lat: list.reduce((s, p) => s + p.lat, 0) / list.length, lng: list.reduce((s, p) => s + p.lng, 0) / list.length };
    const left = [...list];
    while (left.length) {
      const seed = left.reduce((b, p) => (km(p, centre) > km(b, centre) ? p : b));
      const take = left.sort((a, b) => km(a, seed) - km(b, seed)).splice(0, size);
      const mine = pins.filter((id) => take.some((p) => p.id === id));
      const stops = orderPathFrom(take, mine);
      groups.push({ city, stops, km: pathLen(stops), pinned: mine.length });
    }
  });
  return groups;
};

/**
 * Re-orders `stores` (current visiting order) into a short route while the ones in `pinned` (a Set of ids) keep
 * exactly the slot they hold now. The free stores are first chained into a short path, dropped into the free
 * slots, then improved by swaps and segment reversals over the free slots only (cost = whole route length,
 * so legs to/from the pinned stops count). Stores without coordinates fill the last free slots.
 */
export const orderWithPins = (stores, pinned) => {
  const slots = stores.map((s) => (pinned.has(s.id) ? s : null));
  const freeIdx = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
  const free = stores.filter((s) => !pinned.has(s.id));
  const located = free.filter((s) => s.lat != null);
  const unlocated = free.filter((s) => s.lat == null);
  const movable = freeIdx.slice(0, located.length);
  const leg = (a, b) => (a && b && a.lat != null && b.lat != null ? km(a, b) : 0);
  const cost = (arr) => arr.reduce((n, s, i) => (i ? n + leg(arr[i - 1], s) : 0), 0);
  const fill = (chain) => { const a = [...slots]; movable.forEach((slot, k) => { a[slot] = chain[k]; }); freeIdx.slice(located.length).forEach((slot, k) => { a[slot] = unlocated[k]; }); return a; };
  const chain = orderPath(located);
  let best = fill(chain);
  const alt = fill([...chain].reverse());
  if (cost(alt) < cost(best)) best = alt;
  let bestCost = cost(best);
  for (let improved = true, guard = 0; improved && guard < 40; guard += 1) {
    improved = false;
    for (let x = 0; x < movable.length; x += 1) {
      for (let y = x + 1; y < movable.length; y += 1) {
        const swap = [...best]; [swap[movable[x]], swap[movable[y]]] = [swap[movable[y]], swap[movable[x]]];
        const rev = [...best]; const seg = movable.slice(x, y + 1).map((i) => best[i]).reverse(); movable.slice(x, y + 1).forEach((i, k) => { rev[i] = seg[k]; });
        const cs = cost(swap); const cr = cost(rev);
        const [c, next] = cs <= cr ? [cs, swap] : [cr, rev];
        if (c < bestCost - 1e-9) { best = next; bestCost = c; improved = true; }
      }
    }
  }
  return best;
};

export { orderPath, km as kmBetweenPoints };
