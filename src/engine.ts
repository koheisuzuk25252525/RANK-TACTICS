export const W = 40,
  H = 30,
  DT = 0.1,
  LIMIT = 120;
export type Point = { x: number; y: number };
export type Role = "attacker" | "gunner" | "sniper";
export type Tactic = "auto" | "flank" | "support" | "ambush";
export type Unit = Point & {
  id: number;
  team: number;
  role: Role;
  hp: number;
  cool: number;
  moveCool: number;
  guard: boolean;
  order?: Point;
  target?: number;
  tactic: Tactic;
  kills: number;
};
export type Contact = Point & { id: number; hp: number; seen: number };
export type Intel = {
  allies: Unit[];
  contacts: Contact[];
  map: boolean[];
  time: number;
};
export type Game = {
  units: Unit[];
  map: boolean[];
  time: number;
  seed: number;
  rng: number;
  intel: Contact[][];
  events: string[];
  winner?: number;
  reason?: string;
  shots: { from: Point; to: Point; ttl: number }[];
};
export const stats: Record<
  Role,
  { range: number; vision: number; damage: number; rate: number; move: number }
> = {
  attacker: { range: 5, vision: 10, damage: 25, rate: 0.8, move: 0.2 },
  gunner: { range: 9, vision: 12, damage: 16, rate: 0.6, move: 0.3 },
  sniper: { range: 16, vision: 18, damage: 42, rate: 2, move: 0.4 },
};
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const idx = (p: Point) => p.y * W + p.x;
export const blocked = (map: boolean[], p: Point) =>
  p.x < 0 || p.y < 0 || p.x >= W || p.y >= H || map[idx(p)];
export function los(map: boolean[], a: Point, b: Point) {
  let x = a.x,
    y = a.y;
  const dx = Math.abs(b.x - x),
    dy = Math.abs(b.y - y),
    sx = x < b.x ? 1 : -1,
    sy = y < b.y ? 1 : -1;
  let e = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * e;
    if (e2 > -dy) {
      e -= dy;
      x += sx;
    }
    if (e2 < dx) {
      e += dx;
      y += sy;
    }
    if (blocked(map, { x, y })) return false;
  }
  return true;
}
export function createGame(seed = 2525): Game {
  const map = Array<boolean>(W * H).fill(false);
  for (const [x, y, w, h] of [
    [7, 3, 5, 5],
    [7, 13, 5, 5],
    [7, 23, 5, 4],
    [17, 5, 6, 5],
    [17, 20, 6, 5],
    [28, 3, 5, 5],
    [28, 13, 5, 5],
    [28, 23, 5, 4],
  ])
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) map[j * W + i] = true;
  const units: Unit[] = [];
  for (let team = 0; team < 2; team++)
    (["attacker", "gunner", "sniper"] as Role[]).forEach((role, i) =>
      units.push({
        id: team * 3 + i,
        team,
        role,
        x: team ? 36 : 3,
        y: 11 + i * 4,
        hp: 100,
        cool: 0,
        moveCool: 0,
        guard: false,
        tactic: "auto",
        kills: 0,
      }),
    );
  return {
    units,
    map,
    time: 0,
    seed,
    rng: seed >>> 0 || 1,
    intel: [[], []],
    events: ["作戦開始 — 敵を索敵してください"],
    shots: [],
  };
}
function random(g: Game) {
  g.rng ^= g.rng << 13;
  g.rng ^= g.rng >>> 17;
  g.rng ^= g.rng << 5;
  return (g.rng >>> 0) / 4294967296;
}
export function observe(g: Game, team: number): Intel {
  const allies = g.units.filter((u) => u.team === team && u.hp > 0);
  const seen = g.units.filter(
    (e) =>
      e.team !== team &&
      e.hp > 0 &&
      allies.some(
        (a) => distance(a, e) <= stats[a.role].vision && los(g.map, a, e),
      ),
  );
  const old = g.intel[team].filter(
    (c) => g.time - c.seen < 8 && !seen.some((s) => s.id === c.id),
  );
  g.intel[team] = [
    ...old,
    ...seen.map((e) => ({ id: e.id, x: e.x, y: e.y, hp: e.hp, seen: g.time })),
  ];
  return {
    allies: allies.map((a) => ({ ...a })),
    contacts: g.intel[team].map((c) => ({ ...c })),
    map: g.map.slice(),
    time: g.time,
  };
}
// Decision receives only the team's observations, never the enemy unit collection.
export function decide(
  u: Unit,
  intel: Intel,
): { destination?: Point; target?: number; guard: boolean } {
  const known = intel.contacts;
  const target =
    known.find((c) => c.id === u.target) ??
    [...known].sort((a, b) => distance(u, a) - distance(u, b))[0];
  if (u.order) return { destination: u.order, guard: false };
  if (
    target &&
    intel.time - target.seen < 0.15 &&
    distance(u, target) <= stats[u.role].range &&
    los(intel.map, u, target)
  )
    return { target: target.id, guard: true };
  if (u.tactic === "ambush") return { guard: true };
  let destination: Point = target ?? {
    x: u.team ? 18 : 21,
    y: 10 + (u.id % 3) * 5,
  };
  if (u.tactic === "flank")
    destination = { x: target?.x ?? 20, y: u.id % 2 ? 27 : 2 };
  if (u.tactic === "support") {
    const leader = intel.allies.find((a) => a.role === "attacker");
    if (leader && distance(u, leader) > 4) destination = leader;
  }
  return { destination, guard: false };
}
export function pathStep(
  map: boolean[],
  start: Point,
  goal: Point,
  occupied: Point[] = [],
): Point | undefined {
  const queue: Point[] = [start],
    prev = new Map<number, Point>();
  const visited = new Set([idx(start)]);
  let best = start;
  for (let k = 0; k < queue.length; k++) {
    const p = queue[k];
    if (distance(p, goal) < distance(best, goal)) best = p;
    if (p.x === goal.x && p.y === goal.y) {
      best = p;
      break;
    }
    for (const d of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const n = { x: p.x + d[0], y: p.y + d[1] };
      if (
        blocked(map, n) ||
        visited.has(idx(n)) ||
        occupied.some((o) => o.x === n.x && o.y === n.y)
      )
        continue;
      visited.add(idx(n));
      prev.set(idx(n), p);
      queue.push(n);
    }
  }
  if (best === start) return;
  let p = best;
  while (prev.get(idx(p)) !== start) {
    const parent = prev.get(idx(p));
    if (!parent) return;
    p = parent;
  }
  return p;
}
export function score(g: Game, team: number) {
  return g.units
    .filter((u) => u.team === team)
    .reduce((s, u) => s + u.kills * 100 + (u.hp > 0 ? 50 : 0), 0);
}
export function command(
  g: Game,
  id: number,
  order: { move?: Point; target?: number; tactic?: Tactic },
) {
  const u = g.units.find((u) => u.id === id && u.team === 0 && u.hp > 0);
  if (!u || g.winner !== undefined) return;
  if (order.move && !blocked(g.map, order.move)) {
    u.order = { ...order.move };
    u.target = undefined;
  }
  if (
    order.target !== undefined &&
    g.intel[0].some((c) => c.id === order.target)
  ) {
    u.target = order.target;
    u.order = undefined;
  }
  if (order.tactic) {
    u.tactic = order.tactic;
    u.order = undefined;
    u.target = undefined;
  }
}
export function tick(g: Game) {
  if (g.winner !== undefined) return;
  g.time = +(g.time + DT).toFixed(4);
  g.shots = g.shots
    .map((s) => ({ ...s, ttl: s.ttl - DT }))
    .filter((s) => s.ttl > 0);
  const views = [observe(g, 0), observe(g, 1)];
  for (const u of g.units) {
    if (u.hp <= 0) continue;
    u.cool = Math.max(0, u.cool - DT);
    u.moveCool = Math.max(0, u.moveCool - DT);
    const action = decide({ ...u }, views[u.team]);
    u.guard = action.guard;
    if (action.target !== undefined && u.cool <= 0) {
      const enemy = g.units.find((e) => e.id === action.target && e.hp > 0);
      if (
        enemy &&
        distance(u, enemy) <= stats[u.role].range &&
        los(g.map, u, enemy)
      ) {
        const damage = Math.round(
          stats[u.role].damage *
            (0.9 + random(g) * 0.2) *
            (enemy.guard ? 0.65 : 1),
        );
        enemy.hp = Math.max(0, enemy.hp - damage);
        u.cool = stats[u.role].rate;
        g.shots.push({
          from: { x: u.x, y: u.y },
          to: { x: enemy.x, y: enemy.y },
          ttl: 0.25,
        });
        if (!enemy.hp) {
          u.kills++;
          g.events.unshift(
            `${u.team ? "敵" : "味方"} ${u.role} が ${enemy.team ? "敵" : "味方"} ${enemy.role} を撃破`,
          );
          g.events = g.events.slice(0, 6);
        }
      }
    } else if (action.destination && u.moveCool <= 0) {
      const next = pathStep(
        g.map,
        u,
        action.destination,
        g.units.filter((a) => a.hp > 0 && a.id !== u.id),
      );
      if (next) {
        u.x = next.x;
        u.y = next.y;
        u.moveCool = stats[u.role].move;
      }
      if (u.order && u.x === u.order.x && u.y === u.order.y)
        u.order = undefined;
    }
  }
  const alive = [0, 1].map(
    (t) => g.units.filter((u) => u.team === t && u.hp > 0).length,
  );
  if (alive.includes(0) || g.time >= LIMIT) {
    const a = score(g, 0),
      b = score(g, 1);
    g.winner = a === b ? 2 : a > b ? 0 : 1;
    g.reason = alive.includes(0) ? "部隊全滅" : "制限時間";
    g.events.unshift("作戦終了");
  }
}
