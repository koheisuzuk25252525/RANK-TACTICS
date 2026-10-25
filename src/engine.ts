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
  aim?: { target: number; at: Point; remaining: number; duration: number };
  dashUntil: number;
  dashReady: number;
  smokeLeft: number;
  hitAt: number;
};
export type Contact = Point & {
  id: number;
  hp: number;
  seen: number;
  aimingAt?: Point;
};
export type CombatEvent = {
  id: number;
  kind: "shot" | "hit" | "kill" | "miss" | "contact";
  at: Point;
  from?: Point;
  team: number;
  damage?: number;
  visible: boolean;
  time: number;
};
export type Smoke = Point & { until: number };
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
  objective: number[];
  control: number;
  effects: CombatEvent[];
  nextEvent: number;
  smokes: Smoke[];
  shots: { from: Point; to: Point; ttl: number }[];
};
export const stats: Record<
  Role,
  { range: number; vision: number; damage: number; rate: number; move: number }
> = {
  attacker: { range: 5, vision: 10, damage: 25, rate: 0.8, move: 0.2 },
  gunner: { range: 9, vision: 12, damage: 16, rate: 0.6, move: 0.3 },
  sniper: { range: 16, vision: 18, damage: 42, rate: 2.8, move: 0.4 },
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
        dashUntil: 0,
        dashReady: 0,
        smokeLeft: 1,
        hitAt: -10,
      }),
    );
  return {
    units,
    map,
    time: 0,
    seed,
    rng: seed >>> 0 || 1,
    intel: [[], []],
    events: ["中央の通信局を確保せよ。射撃予兆から退避し、煙幕で射線を切れ"],
    objective: [0, 0],
    control: -1,
    effects: [],
    nextEvent: 0,
    smokes: [],
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
        (a) => distance(a, e) <= stats[a.role].vision && clearShot(g, a, e),
      ),
  );
  const old = g.intel[team].filter(
    (c) => g.time - c.seen < 8 && !seen.some((s) => s.id === c.id),
  );
  g.intel[team] = [
    ...old,
    ...seen.map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      hp: e.hp,
      seen: g.time,
      aimingAt: e.role === "sniper" && e.aim ? { ...e.aim.at } : undefined,
    })),
  ];
  return {
    allies: allies.map((a) => ({ ...a })),
    contacts: g.intel[team].map((c) => ({ ...c })),
    map: sightMap(g),
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
  // A visible sniper's locked position can be evaded. No hidden state is consulted.
  const threat = known.find(
    (c) =>
      intel.time - c.seen < 0.15 && c.aimingAt && distance(c.aimingAt, u) < 1.5,
  );
  if (threat && u.tactic !== "ambush" && !u.aim) {
    const candidates = [
      { x: u.x, y: u.y + 2 },
      { x: u.x, y: u.y - 2 },
      { x: u.x + 2, y: u.y },
      { x: u.x - 2, y: u.y },
    ];
    const escape = candidates.find(
      (p) =>
        !blocked(intel.map, p) && distance(p, threat) > distance(u, threat),
    );
    if (escape) return { destination: escape, guard: false };
  }
  if (
    target &&
    intel.time - target.seen < 0.15 &&
    distance(u, target) <= stats[u.role].range &&
    los(intel.map, u, target)
  )
    return { target: target.id, guard: true };
  if (u.tactic === "ambush") return { guard: true };
  let destination: Point = target ?? {
    x: u.team ? 21 : 18,
    y: 14 + (u.id % 3) - 1,
  };
  if (
    u.tactic === "flank" &&
    target &&
    Math.abs(u.y - target.y) < 4 &&
    distance(u, target) > 5
  )
    destination = {
      x: target.x,
      y: Math.max(1, Math.min(H - 2, target.y + (u.id % 2 ? -6 : 6))),
    };
  if (u.tactic === "support") {
    const leader = intel.allies.find((a) => a.role === "attacker");
    if (leader && distance(u, leader) > 4) destination = leader;
  }
  return { destination, guard: false };
}
export const OBJECTIVE: Point = { x: 20, y: 14 };
export function inCover(map: boolean[], u: Point) {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([x, y]) => {
    const p = { x: u.x + x, y: u.y + y };
    return p.x >= 0 && p.x < W && p.y >= 0 && p.y < H && map[idx(p)];
  });
}
export function sightMap(g: Game) {
  const map = g.map.slice();
  for (const smoke of g.smokes)
    if (smoke.until > g.time)
      for (let y = smoke.y - 2; y <= smoke.y + 2; y++)
        for (let x = smoke.x - 2; x <= smoke.x + 2; x++)
          if (
            x >= 0 &&
            x < W &&
            y >= 0 &&
            y < H &&
            distance(smoke, { x, y }) <= 2
          )
            map[y * W + x] = true;
  return map;
}
export function clearShot(g: Game, a: Point, b: Point) {
  if (
    g.smokes.some(
      (s) => s.until > g.time && (distance(s, a) <= 2 || distance(s, b) <= 2),
    )
  )
    return false;
  return los(sightMap(g), a, b);
}
function effect(g: Game, event: Omit<CombatEvent, "id" | "time" | "visible">) {
  const visible =
    event.team === 0 ||
    g.units.some(
      (a) =>
        a.team === 0 &&
        a.hp > 0 &&
        distance(a, event.at) <= stats[a.role].vision &&
        clearShot(g, a, event.at),
    );
  const fromVisible =
    !event.from ||
    event.team === 0 ||
    g.units.some(
      (a) =>
        a.team === 0 &&
        a.hp > 0 &&
        distance(a, event.from!) <= stats[a.role].vision &&
        clearShot(g, a, event.from!),
    );
  g.effects.push({
    ...event,
    from: fromVisible ? event.from : undefined,
    id: g.nextEvent++,
    time: g.time,
    visible,
  });
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
  return (
    Math.floor(g.objective[team]) +
    g.units
      .filter((u) => u.team === team)
      .reduce((s, u) => s + u.kills * 100 + (u.hp > 0 ? 50 : 0), 0)
  );
}
export function command(
  g: Game,
  id: number,
  order: {
    move?: Point;
    target?: number;
    tactic?: Tactic;
    ability?: "dash" | "smoke";
  },
) {
  const u = g.units.find((u) => u.id === id && u.team === 0 && u.hp > 0);
  if (!u || g.winner !== undefined) return;
  if (order.ability === "dash" && g.time >= u.dashReady) {
    u.dashUntil = g.time + 2.5;
    u.dashReady = g.time + 12;
    g.events.unshift("緊急ダッシュ — 2.5秒間、移動速度2倍");
  }
  if (order.ability === "smoke" && u.smokeLeft > 0) {
    g.smokes.push({ x: u.x, y: u.y, until: g.time + 6 });
    u.smokeLeft--;
    u.aim = undefined;
    g.events.unshift("煙幕展開 — 6秒間、双方の射線と視界を遮断");
  }
  if (order.move && !blocked(g.map, order.move)) {
    u.aim = undefined;
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
    u.aim = undefined;
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
  g.smokes = g.smokes.filter((s) => s.until > g.time);
  g.effects = g.effects.filter((e) => g.time - e.time < 2);
  const previous = new Set(g.intel[0].map((c) => c.id));
  const views = [observe(g, 0), observe(g, 1)];
  for (const c of views[0].contacts)
    if (!previous.has(c.id) && g.time - c.seen < 0.15) {
      effect(g, { kind: "contact", at: c, team: 1 });
      g.events.unshift("敵影を確認 — 射線と退避経路を確保せよ");
    }
  // Resolve simultaneous intentions before damage: team order grants no first-shot advantage.
  const actions = new Map(
    g.units
      .filter((u) => u.hp > 0)
      .map((u) => [u.id, decide({ ...u }, views[u.team])]),
  );
  for (const u of g.units) if (u.hp > 0) u.guard = actions.get(u.id)!.guard;
  const volleys: { u: Unit; aim: NonNullable<Unit["aim"]> }[] = [];
  for (const u of g.units) {
    if (u.hp <= 0) continue;
    u.cool = Math.max(0, u.cool - DT);
    u.moveCool = Math.max(0, u.moveCool - DT);
    const action = actions.get(u.id)!;
    if (u.aim) {
      const enemy = g.units.find((e) => e.id === u.aim!.target && e.hp > 0);
      if (!enemy || !clearShot(g, u, u.aim.at) || action.destination) {
        u.aim = undefined;
      } else {
        u.aim.remaining -= DT;
        if (u.aim.remaining <= 0.001) {
          volleys.push({ u, aim: u.aim });
          u.aim = undefined;
          u.cool = stats[u.role].rate;
        }
      }
    } else if (action.target !== undefined && u.cool <= 0) {
      const c = views[u.team].contacts.find((c) => c.id === action.target);
      if (c) {
        const duration =
          u.role === "sniper" ? 1.6 : u.role === "gunner" ? 0.55 : 0.35;
        u.aim = {
          target: c.id,
          at: { x: c.x, y: c.y },
          remaining: duration,
          duration,
        };
      }
    }
    if (action.destination && u.moveCool <= 0) {
      const next = pathStep(
        g.map,
        u,
        action.destination,
        g.units.filter((a) => a.hp > 0 && a.id !== u.id),
      );
      if (next) {
        u.x = next.x;
        u.y = next.y;
        u.moveCool = stats[u.role].move * (u.dashUntil > g.time ? 0.5 : 1);
      }
      if (u.order && u.x === u.order.x && u.y === u.order.y)
        u.order = undefined;
    }
  }
  for (const { u, aim } of volleys) {
    const enemy = g.units.find((e) => e.id === aim.target && e.hp > 0);
    const from = { x: u.x, y: u.y };
    effect(g, { kind: "shot", at: aim.at, from, team: u.team });
    g.shots.push({ from, to: aim.at, ttl: 0.25 });
    if (!enemy || distance(enemy, aim.at) > 1 || !clearShot(g, u, enemy)) {
      effect(g, { kind: "miss", at: aim.at, team: u.team });
      continue;
    }
    const damage = Math.round(
      stats[u.role].damage *
        (0.9 + random(g) * 0.2) *
        (enemy.guard ? 0.8 : 1) *
        (inCover(g.map, enemy) ? 0.65 : 1),
    );
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitAt = g.time;
    effect(g, {
      kind: enemy.hp ? "hit" : "kill",
      at: { x: enemy.x, y: enemy.y },
      team: enemy.team,
      damage,
    });
    if (!enemy.hp) {
      enemy.aim = undefined;
      u.kills++;
      g.events.unshift(
        `${u.team ? "敵" : "味方"} ${u.role} が ${enemy.team ? "敵" : "味方"} ${enemy.role} を撃破`,
      );
    }
  }
  const presence = [0, 1].map((t) =>
    g.units.some(
      (u) => u.team === t && u.hp > 0 && distance(u, OBJECTIVE) <= 3,
    ),
  );
  g.control =
    presence[0] && presence[1] ? 2 : presence[0] ? 0 : presence[1] ? 1 : -1;
  if (g.control === 0 || g.control === 1)
    g.objective[g.control] += DT * (g.time >= 90 ? 6 : 3);
  g.events = g.events.slice(0, 6);
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
