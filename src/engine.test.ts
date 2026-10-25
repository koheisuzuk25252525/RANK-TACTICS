import { describe, it, expect } from "vitest";
import {
  createGame,
  tick,
  los,
  pathStep,
  observe,
  decide,
  command,
  score,
  W,
  H,
} from "./engine";
describe("battle simulation", () => {
  it("completes a full match deterministically", () => {
    const a = createGame(2525),
      b = createGame(2525);
    for (let i = 0; i < 1200; i++) {
      tick(a);
      tick(b);
    }
    expect(a).toEqual(b);
    expect(a.winner).toBeDefined();
    expect(a.time).toBeLessThanOrEqual(120);
    expect(a.units.some((u) => u.hp < 100)).toBe(true);
    expect(score(a, 0) + score(a, 1)).toBeGreaterThan(0);
  });
  it("blocks line of sight and routes around buildings", () => {
    const g = createGame();
    expect(los(g.map, { x: 6, y: 4 }, { x: 13, y: 4 })).toBe(false);
    let p = { x: 6, y: 4 };
    for (let i = 0; i < 30 && p.x !== 13; i++) {
      p = pathStep(g.map, p, { x: 13, y: 4 })!;
      expect(g.map[p.y * W + p.x]).toBe(false);
    }
    expect(p.x).toBe(13);
  });
  it("does not reveal unseen enemies and expires shared contacts", () => {
    const g = createGame();
    expect(observe(g, 1).contacts).toEqual([]);
    g.units[0].x = 34;
    g.units[0].y = 11;
    expect(observe(g, 1).contacts.some((c) => c.id === 0)).toBe(true);
    g.units[0].x = 0;
    g.time = 9;
    expect(observe(g, 1).contacts.some((c) => c.id === 0)).toBe(false);
  });
  it("AI acts only on supplied intel, can hold an ambush", () => {
    const g = createGame();
    const u = { ...g.units[3], tactic: "ambush" as const };
    expect(
      decide(u, { allies: [u], contacts: [], map: g.map, time: 0 }),
    ).toEqual({ guard: true });
    expect(
      decide(
        { ...u, tactic: "auto" },
        { allies: [u], contacts: [], map: g.map, time: 0 },
      ).target,
    ).toBeUndefined();
  });
  it("obeys move orders, rejects walls, and resumes autonomy on arrival", () => {
    const g = createGame();
    command(g, 0, { move: { x: 7, y: 4 } });
    expect(g.units[0].order).toBeUndefined();
    command(g, 0, { move: { x: 4, y: 11 } });
    tick(g);
    expect(g.units[0].x).toBe(4);
    expect(g.units[0].order).toBeUndefined();
  });
  it("scores kills and living units and freezes completed matches", () => {
    const g = createGame();
    g.units.filter((u) => u.team === 1).forEach((u) => (u.hp = 0));
    g.units[0].kills = 3;
    tick(g);
    expect(g.winner).toBe(0);
    expect(score(g, 0)).toBe(450);
    const time = g.time;
    tick(g);
    expect(g.time).toBe(time);
  });
  it("retains valid grid positions and hit points throughout a match", () => {
    const g = createGame(42);
    for (let i = 0; i < 1200; i++) {
      tick(g);
      for (const u of g.units) {
        expect(u.x >= 0 && u.x < W && u.y >= 0 && u.y < H).toBe(true);
        expect(g.map[u.y * W + u.x]).toBe(false);
        expect(u.hp).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("pressure, counterplay and information boundaries", () => {
  it("awards control points only for an uncontested relay and doubles the final phase", () => {
    const g = createGame();
    g.map.fill(false);
    g.units[0].x = 20;
    g.units[0].y = 14;
    tick(g);
    expect(g.control).toBe(0);
    expect(g.objective[0]).toBeCloseTo(0.3);
    g.units[3].x = 21;
    g.units[3].y = 14;
    tick(g);
    expect(g.control).toBe(2);
    expect(g.objective[0]).toBeCloseTo(0.3);
    g.units[3].x = 36;
    g.time = 90;
    tick(g);
    expect(g.objective[0]).toBeCloseTo(0.9);
  });
  it("telegraphs sniper fire and permits a locked shot to be dodged", () => {
    const g = createGame();
    g.map.fill(false);
    g.units.forEach((u) => (u.hp = 0));
    const a = g.units[2],
      b = g.units[3];
    Object.assign(a, { hp: 100, x: 10, y: 10, tactic: "ambush" });
    Object.assign(b, { hp: 100, x: 20, y: 10, tactic: "ambush" });
    tick(g);
    expect(a.aim?.duration).toBe(1.6);
    expect(b.hp).toBe(100);
    b.y = 13;
    for (let i = 0; i < 16; i++) tick(g);
    expect(b.hp).toBe(100);
    expect(g.effects.some((e) => e.kind === "miss")).toBe(true);
  });
  it("smoke conceals contacts, cancels incoming aim and consumes one charge", () => {
    const g = createGame();
    g.map.fill(false);
    g.units[0].x = 32;
    g.units[0].y = 11;
    tick(g);
    expect(
      observe(g, 1).contacts.some((c) => c.id === 0 && c.seen === g.time),
    ).toBe(true);
    command(g, 0, { ability: "smoke" });
    command(g, 0, { ability: "smoke" });
    expect(g.smokes).toHaveLength(1);
    expect(g.units[0].smokeLeft).toBe(0);
    tick(g);
    expect(
      observe(g, 1).contacts.some((c) => c.id === 0 && c.seen === g.time),
    ).toBe(false);
    expect(g.units[3].aim).toBeUndefined();
  });
  it("dash respects its cooldown and move orders cancel a pending shot", () => {
    const g = createGame();
    command(g, 0, { ability: "dash" });
    expect(g.units[0].dashUntil).toBe(2.5);
    expect(g.units[0].dashReady).toBe(12);
    g.time = 1;
    command(g, 0, { ability: "dash" });
    expect(g.units[0].dashUntil).toBe(2.5);
    g.units[0].aim = {
      target: 3,
      at: { x: 36, y: 11 },
      remaining: 1,
      duration: 1,
    };
    command(g, 0, { move: { x: 4, y: 11 } });
    expect(g.units[0].aim).toBeUndefined();
  });
  it("cover mitigates otherwise identical shots", () => {
    function damage(cover: boolean) {
      const g = createGame(55);
      g.map.fill(false);
      g.units.forEach((u) => (u.hp = 0));
      const a = g.units[2],
        b = g.units[3];
      Object.assign(a, { hp: 100, x: 10, y: 10, tactic: "ambush" });
      Object.assign(b, { hp: 100, x: 20, y: 10, tactic: "ambush" });
      if (cover) g.map[11 * W + 20] = true;
      for (let i = 0; i < 18; i++) tick(g);
      return 100 - b.hp;
    }
    expect(damage(true)).toBeLessThan(damage(false));
    expect(damage(true)).toBeGreaterThan(0);
  });
  it("preserves replay determinism through smoke, dash, orders and seeded combat", () => {
    const a = createGame(719),
      b = createGame(719);
    for (let i = 0; i < 1200; i++) {
      for (const g of [a, b]) {
        if (i === 40) command(g, 0, { ability: "smoke" });
        if (i === 45) {
          command(g, 0, { ability: "dash" });
          command(g, 0, { move: { x: 20, y: 14 } });
        }
        tick(g);
      }
    }
    expect(a).toEqual(b);
    expect(a.winner).toBeDefined();
  });
});
