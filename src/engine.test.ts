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
