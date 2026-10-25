// Continuous arena physics, independent of React and Pixi. Fixed 120 Hz updates.
export const ARENA = { w: 960, h: 560 },
  STEP = 1 / 120;
export type Vec = { x: number; y: number };
export type Fighter = Vec & {
  hp: number;
  energy: number;
  vx: number;
  vy: number;
  angle: number;
  cool: number;
  stun: number;
  guard: boolean;
  parryUntil: number;
  counterUntil: number;
  slashUntil: number;
  hitUntil: number;
};
export type Input = {
  x: number;
  y: number;
  fire: boolean;
  guard: boolean;
  slash: boolean;
};
export type Wall = { x: number; y: number; w: number; h: number };
export type Spark = Vec & {
  kind: "shot" | "hit" | "slash" | "parry" | "block" | "wall";
  angle: number;
  time: number;
  id: number;
};
export type Bullet = Vec & {
  vx: number;
  vy: number;
  team: 0 | 1;
  life: number;
};
export type Duel = {
  time: number;
  p: Fighter;
  e: Fighter;
  walls: Wall[];
  bullets: Bullet[];
  effects: Spark[];
  serial: number;
  freeze: number;
  started: boolean;
  winner?: "you" | "enemy" | "draw";
  telegraph?: { kind: "shot" | "slash"; until: number; angle: number };
  enemyNext: number;
  guardHeld: boolean;
  slashHeld: boolean;
  slashQueueUntil: number;
  metrics: { slashes: number; shots: number; parries: number; blocks: number };
  notice: string;
  noticeUntil: number;
};
export const len = (v: Vec) => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const facing = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);
export const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
function fighter(x: number, y: number): Fighter {
  return {
    x,
    y,
    hp: 100,
    energy: 100,
    vx: 0,
    vy: 0,
    angle: 0,
    cool: 0,
    stun: 0,
    guard: false,
    parryUntil: 0,
    counterUntil: 0,
    slashUntil: 0,
    hitUntil: 0,
  };
}
export function newDuel(): Duel {
  return {
    time: 0,
    p: fighter(220, 280),
    e: fighter(740, 280),
    walls: [
      { x: 370, y: 95, w: 70, h: 95 },
      { x: 520, y: 370, w: 70, h: 95 },
      { x: 150, y: 90, w: 85, h: 30 },
      { x: 725, y: 440, w: 85, h: 30 },
    ],
    bullets: [],
    effects: [],
    serial: 0,
    freeze: 0,
    started: false,
    enemyNext: 1.6,
    guardHeld: false,
    slashHeld: false,
    slashQueueUntil: 0,
    metrics: { slashes: 0, shots: 0, parries: 0, blocks: 0 },
    notice: "相手の予兆を見て、動く。受ける。切り返す。",
    noticeUntil: 4,
  };
}
export function solid(g: Duel, p: Vec, r = 16) {
  return (
    p.x < r ||
    p.y < r ||
    p.x > ARENA.w - r ||
    p.y > ARENA.h - r ||
    g.walls.some(
      (w) =>
        p.x + r > w.x &&
        p.x - r < w.x + w.w &&
        p.y + r > w.y &&
        p.y - r < w.y + w.h,
    )
  );
}
function move(g: Duel, u: Fighter, dx: number, dy: number) {
  if (!solid(g, { x: u.x + dx, y: u.y })) u.x += dx;
  if (!solid(g, { x: u.x, y: u.y + dy })) u.y += dy;
}
function clear(g: Duel, a: Vec, b: Vec) {
  const n = Math.ceil(dist(a, b) / 8);
  for (let i = 1; i < n; i++)
    if (
      solid(
        g,
        { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n },
        2,
      )
    )
      return false;
  return true;
}
function fx(g: Duel, kind: Spark["kind"], at: Vec, angle = 0) {
  g.effects.push({ ...at, kind, angle, time: g.time, id: g.serial++ });
}
function notice(g: Duel, text: string) {
  g.notice = text;
  g.noticeUntil = g.time + 1.8;
}
function hurt(g: Duel, target: Fighter, damage: number, angle: number) {
  target.hp = Math.max(0, target.hp - damage);
  target.hitUntil = g.time + 0.18;
  fx(g, "hit", target, angle);
  move(g, target, Math.cos(angle) * 10, Math.sin(angle) * 10);
}
function shoot(g: Duel, u: Fighter, angle: number, team: 0 | 1, speed = 440) {
  g.bullets.push({
    x: u.x + Math.cos(angle) * 22,
    y: u.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    team,
    life: 2.4,
  });
  fx(g, "shot", u, angle);
}
function defend(g: Duel, angle: number, melee: boolean) {
  const p = g.p;
  if (!p.guard || Math.abs(angleDelta(angle + Math.PI, p.angle)) > 1.35)
    return false;
  if (p.parryUntil >= g.time) {
    g.metrics.parries++;
    g.e.stun = 0.7;
    g.telegraph = undefined;
    g.enemyNext = g.time + 1.1;
    p.counterUntil = g.time + 1.8;
    g.freeze = 0.065;
    fx(g, "parry", p, angle);
    notice(g, "JUST GUARD — 今なら斬撃が強化！");
    return true;
  }
  const cost = melee ? 30 : 9;
  if (p.energy < cost) {
    p.energy = 0;
    p.guard = false;
    notice(g, "GUARD BREAK — 離れて回復");
    return false;
  }
  p.energy -= cost;
  g.metrics.blocks++;
  fx(g, "block", p, angle);
  return true;
}
export function advance(g: Duel, input: Input, dt = STEP) {
  if (!g.started || g.winner) return;
  g.time += dt;
  if (g.time >= 60) {
    g.winner = g.p.hp === g.e.hp ? "draw" : g.p.hp > g.e.hp ? "you" : "enemy";
    return;
  }
  g.effects = g.effects.filter((e) => g.time - e.time < 0.65);
  if (g.freeze > 0) {
    g.freeze = Math.max(0, g.freeze - dt);
    return;
  }
  const p = g.p,
    e = g.e;
  const oldEnemy = { x: e.x, y: e.y };
  const slashPressed = input.slash && !g.slashHeld;
  g.slashHeld = input.slash;
  if (slashPressed) g.slashQueueUntil = g.time + 0.24;
  p.angle = facing(p, e);
  e.angle = facing(e, p);
  for (const u of [p, e]) {
    u.cool = Math.max(0, u.cool - dt);
    u.stun = Math.max(0, u.stun - dt);
  }
  if (input.guard && !g.guardHeld && p.energy >= 12) {
    p.parryUntil = g.time + 0.19;
    p.energy -= 12;
  }
  g.guardHeld = input.guard;
  p.guard = input.guard && p.energy > 0;
  p.energy = Math.max(
    0,
    Math.min(100, p.energy + (p.guard ? -18 : input.guard ? 0 : 24) * dt),
  );
  const magnitude = Math.max(1, Math.hypot(input.x, input.y));
  if (!p.stun)
    move(
      g,
      p,
      (input.x / magnitude) * 240 * dt * (p.guard ? 0.48 : 1),
      (input.y / magnitude) * 240 * dt * (p.guard ? 0.48 : 1),
    );
  // A short forward burst is part of the slash. Its hit cone follows the visible aim.
  if (g.slashQueueUntil >= g.time && !p.guard && p.cool <= 0 && p.stun <= 0) {
    g.slashQueueUntil = 0;
    p.cool = 0.65;
    p.slashUntil = g.time + 0.18;
    for (let i = 0; i < 8; i++)
      move(g, p, Math.cos(p.angle) * 7, Math.sin(p.angle) * 7);
    fx(g, "slash", p, p.angle);
    if (dist(p, e) < 114 && clear(g, p, e)) {
      const counter = p.counterUntil > g.time;
      hurt(g, e, counter ? 38 : 22, p.angle);
      g.metrics.slashes++;
      e.stun = counter ? 0.5 : 0.12;
      if (counter) {
        g.telegraph = undefined;
        g.enemyNext = g.time + 0.8;
      }
      g.freeze = 0.045;
      if (counter) {
        p.counterUntil = 0;
        notice(g, "COUNTER +38 — 読み勝った！");
      } else notice(g, "BLADE +22 — 間合いを取った");
    }
  } else if (input.fire && !p.guard && p.cool <= 0 && p.stun <= 0) {
    const travel = dist(p, e) / 590;
    shoot(
      g,
      p,
      facing(p, { x: e.x + e.vx * travel, y: e.y + e.vy * travel }),
      0,
      590,
    );
    p.cool = 0.22;
  }
  // Enemy commits to an observed position when the tell begins; it never reads player inputs.
  if (e.stun <= 0) {
    if (g.telegraph) {
      if (g.time >= g.telegraph.until) {
        const t = g.telegraph;
        g.telegraph = undefined;
        if (t.kind === "shot") {
          for (const offset of [-0.14, 0, 0.14])
            shoot(g, e, t.angle + offset, 1, 340);
        } else {
          e.slashUntil = g.time + 0.2;
          fx(g, "slash", e, t.angle);
          for (let i = 0; i < 7; i++)
            move(g, e, Math.cos(t.angle) * 7, Math.sin(t.angle) * 7);
          if (
            dist(e, p) < 115 &&
            Math.abs(angleDelta(facing(e, p), t.angle)) < 1.2 &&
            clear(g, e, p) &&
            !defend(g, t.angle, true)
          ) {
            hurt(g, p, 20, t.angle);
            notice(g, "被弾 — 赤い斬撃予兆から離れよう");
          }
        }
        g.enemyNext = g.time + 1.15;
      }
    } else if (g.time >= g.enemyNext && clear(g, e, p)) {
      g.telegraph = {
        kind: dist(e, p) < 195 ? "slash" : "shot",
        until: g.time + 0.72,
        angle: facing(e, p),
      };
    } else {
      const d = dist(e, p),
        a = facing(e, p);
      const side = Math.floor(g.time / 3) % 2 ? 1 : -1;
      const toward = d > 230 ? 1 : d < 150 ? -0.6 : 0.05;
      move(
        g,
        e,
        (Math.cos(a) * toward - Math.sin(a) * 0.55 * side) * 105 * dt,
        (Math.sin(a) * toward + Math.cos(a) * 0.55 * side) * 105 * dt,
      );
    }
  }
  const separation = dist(p, e);
  if (separation < 38) {
    const a = separation > 0.01 ? facing(e, p) : 0;
    const push = (38 - separation) / 2;
    move(g, p, Math.cos(a) * push, Math.sin(a) * push);
    move(g, e, -Math.cos(a) * push, -Math.sin(a) * push);
  }
  e.vx = (e.x - oldEnemy.x) / dt;
  e.vy = (e.y - oldEnemy.y) / dt;
  const remaining: Bullet[] = [];
  for (const b of g.bullets) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) continue;
    if (solid(g, b, 3)) {
      fx(g, "wall", b);
      continue;
    }
    const target = b.team === 0 ? e : p;
    if (dist(b, target) < 20) {
      const angle = Math.atan2(b.vy, b.vx);
      if (b.team === 1 && defend(g, angle, false)) {
        if (p.parryUntil >= g.time) {
          const a = facing(p, e);
          b.team = 0;
          b.vx = Math.cos(a) * 630;
          b.vy = Math.sin(a) * 630;
          b.x = p.x + Math.cos(a) * 24;
          b.y = p.y + Math.sin(a) * 24;
          remaining.push(b);
        }
        continue;
      }
      hurt(g, target, b.team === 0 ? 6 : 9, angle);
      if (b.team === 0) g.metrics.shots++;
      continue;
    }
    remaining.push(b);
  }
  g.bullets = remaining;
  if (p.hp <= 0 || e.hp <= 0 || g.time >= 60) {
    g.winner = p.hp === e.hp ? "draw" : p.hp > e.hp ? "you" : "enemy";
    notice(
      g,
      g.winner === "you"
        ? "DUEL WON"
        : g.winner === "enemy"
          ? "DUEL LOST"
          : "DRAW",
    );
  }
}
