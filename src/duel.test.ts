import { describe, it, expect } from "vitest";
import { newDuel, advance, STEP, solid, Duel, Input } from "./duel";
const idle: Input = { x: 0, y: 0, fire: false, slash: false, guard: false };
function setup() {
  const g = newDuel();
  g.started = true;
  g.walls = [];
  g.enemyNext = 100;
  return g;
}
function run(g: Duel, n: number, input: Input = idle) {
  for (let i = 0; i < n; i++) advance(g, input);
}
function incoming(g: Duel) {
  g.bullets.push({
    x: g.p.x + 21,
    y: g.p.y,
    vx: -340,
    vy: 0,
    team: 1,
    life: 2,
  });
}
describe("direct-control duel", () => {
  it("does not advance before start or after a result", () => {
    const g = newDuel();
    run(g, 100);
    expect(g.time).toBe(0);
    g.started = true;
    g.winner = "you";
    run(g, 100);
    expect(g.time).toBe(0);
  });
  it("normalizes diagonal movement and collides with walls", () => {
    const a = setup(),
      b = setup();
    run(a, 30, { ...idle, x: 1 });
    run(b, 30, { ...idle, x: 1, y: 1 });
    expect(Math.hypot(b.p.x - 220, b.p.y - 280)).toBeCloseTo(a.p.x - 220);
    a.walls = [{ x: a.p.x + 30, y: a.p.y - 40, w: 40, h: 80 }];
    run(a, 60, { ...idle, x: 1 });
    expect(solid(a, a.p)).toBe(false);
    expect(a.p.x).toBeLessThan(a.walls[0].x);
  });
  it("gives blade a lunge and strong close-range damage, but no distant hit", () => {
    const a = setup(),
      b = setup();
    a.e.x = a.p.x + 140;
    advance(a, { ...idle, slash: true });
    advance(b, { ...idle, slash: true });
    expect(a.p.x).toBeGreaterThan(220);
    expect(a.e.hp).toBe(78);
    expect(b.e.hp).toBe(100);
    expect(a.metrics.slashes).toBe(1);
  });
  it("bullets travel before hitting and walls stop them", () => {
    const a = setup(),
      b = setup();
    a.e.stun = b.e.stun = 2;
    b.walls = [{ x: 450, y: 220, w: 35, h: 120 }];
    advance(a, { ...idle, fire: true });
    advance(b, { ...idle, fire: true });
    expect(a.e.hp).toBe(100);
    run(a, 120);
    run(b, 120);
    expect(a.e.hp).toBe(94);
    expect(b.e.hp).toBe(100);
  });
  it("just guard reflects a bullet and primes a stronger counter", () => {
    const g = setup();
    incoming(g);
    advance(g, { ...idle, guard: true });
    expect(g.p.hp).toBe(100);
    expect(g.metrics.parries).toBe(1);
    expect(g.bullets[0].team).toBe(0);
    run(g, 10);
    g.e.x = g.p.x + 100;
    advance(g, { ...idle, slash: true });
    expect(g.e.hp).toBe(62);
    expect(g.p.counterUntil).toBe(0);
  });
  it("holding shield uses energy, blocks without a parry and cannot regenerate while held", () => {
    const g = setup();
    run(g, 40, { ...idle, guard: true });
    incoming(g);
    advance(g, { ...idle, guard: true });
    expect(g.metrics.parries).toBe(0);
    expect(g.metrics.blocks).toBe(1);
    expect(g.p.energy).toBeLessThan(88);
    expect(g.p.hp).toBe(100);
    run(g, 900, { ...idle, guard: true });
    expect(g.p.energy).toBe(0);
    run(g, 120);
    expect(g.p.energy).toBeGreaterThan(20);
  });
  it("regular blade hits do not permanently cancel the rival attack", () => {
    const g = setup();
    g.e.x = g.p.x + 100;
    g.telegraph = { kind: "slash", until: 0.5, angle: Math.PI };
    advance(g, { ...idle, slash: true });
    expect(g.telegraph).toBeDefined();
  });
  it("enemy commits to the target position during its tell", () => {
    const g = setup();
    g.enemyNext = 0;
    advance(g, idle);
    const angle = g.telegraph!.angle;
    run(g, 30, { ...idle, y: 1 });
    expect(g.telegraph!.angle).toBe(angle);
  });
  it("replays identical input deterministically and reaches a verdict", () => {
    const a = setup(),
      b = setup();
    a.enemyNext = b.enemyNext = 1;
    for (let i = 0; i < 7300; i++) {
      const input = {
        ...idle,
        x: i % 360 < 180 ? 0.5 : -0.5,
        fire: true,
        guard: i % 240 < 24,
      };
      advance(a, input);
      advance(b, input);
    }
    expect(a).toEqual(b);
    expect(a.winner).toBeDefined();
    expect(a.time).toBeLessThan(60.02);
  });
});

it("requires another press for another slash, rather than automatic melee pursuit", () => {
  const g = setup();
  g.e.x = g.p.x + 140;
  g.e.stun = 5;
  run(g, 100, { ...idle, slash: true });
  expect(g.metrics.slashes).toBe(1);
  advance(g, idle);
  advance(g, { ...idle, slash: true });
  expect(g.metrics.slashes).toBe(2);
});
it("buffers a blade press during the last moment of gun recovery", () => {
  const g = setup();
  g.e.x = g.p.x + 140;
  g.e.stun = 5;
  advance(g, { ...idle, fire: true });
  advance(g, { ...idle, slash: true });
  run(g, 28);
  expect(g.metrics.slashes).toBe(1);
});
