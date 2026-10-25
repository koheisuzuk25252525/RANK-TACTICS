import { describe, it, expect } from "vitest";
import {
  createGame,
  observe,
  canSee,
  command,
  combatStats,
  tick,
  decide,
} from "./engine";
import { defaultKits, MatchConfig, validateKits, drawMap } from "./strategy";
import { analysis } from "./Commentary";
const config = (map: MatchConfig["map"] = "city"): MatchConfig => ({
  map,
  enemy: 1,
  plan: "center",
  focus: 0,
  kits: defaultKits(),
});
describe("loadouts and rank season rules", () => {
  it("validates both four-slot banks", () => {
    const k = defaultKits();
    expect(validateKits(k)).toBe(true);
    k[0].main = 4;
    expect(validateKits(k)).toBe(false);
    expect(() => createGame(1, { ...config(), kits: k })).toThrow();
  });
  it("uses the active trigger, not a fixed profession", () => {
    const g = createGame(1, config());
    const u = g.units[0];
    const blade = combatStats(u);
    command(g, 0, { slot: 1 });
    expect(combatStats(u).range).toBeGreaterThan(blade.range);
    command(g, 0, { slot: 3 });
    expect(combatStats(u).damage).toBe(0);
  });
  it("distinguishes radar from visual contact and prevents shooting radar blips", () => {
    const g = createGame(1, config("night"));
    g.map.fill(false);
    g.units[0].x = 15;
    g.units[1].x = 15;
    g.units[3].x = 23;
    g.units[3].y = 11;
    const intel = observe(g, 0),
      c = intel.contacts.find((c) => c.id === 3)!;
    expect(c.radar).toBe(true);
    expect(c.hp).toBe(0);
    expect(canSee(g, 0, g.units[3])).toBe(false);
    expect(
      decide(g.units[0], { ...intel, contacts: [c] }).target,
    ).toBeUndefined();
  });
  it("stealth vanishes from radar and sight but is detected at close range", () => {
    const g = createGame(1, config());
    g.map.fill(false);
    const e = g.units[3];
    e.kit!.sub = 5;
    e.x = 10;
    e.y = 11;
    expect(observe(g, 0).contacts.some((c) => c.id === 3)).toBe(false);
    g.units[0].x = 9;
    expect(canSee(g, 0, e)).toBe(true);
  });
  it("night reduces visual range and flooded ground penalizes sniping", () => {
    const a = createGame(1, config()),
      b = createGame(1, config("night"));
    for (const g of [a, b]) {
      g.map.fill(false);
      g.units[3].x = 12;
      g.units[3].y = 11;
    }
    expect(canSee(a, 0, a.units[3])).toBe(true);
    expect(canSee(b, 0, b.units[3])).toBe(false);
    const c = createGame(1, config("flood"));
    c.units[2].y = 14;
    expect(combatStats(c.units[2]).range).toBeLessThan(
      combatStats(a.units[2]).range,
    );
  });
  it("commentary cannot infer unseen enemy positions", () => {
    const a = createGame(1, config()),
      b = createGame(1, config());
    a.time = b.time = 10;
    b.units[3].x = 20;
    b.units[3].hp = 1;
    expect(analysis(a)).toEqual(analysis(b));
    expect(analysis(a).text).toContain("位置は不明");
  });
  it("starts different opening plans and enemy loadouts", () => {
    const a = createGame(2, { ...config(), plan: "split", enemy: 0 }),
      b = createGame(2, { ...config(), plan: "hold", enemy: 2 });
    expect(a.units[0].order).not.toEqual(b.units[0].order);
    expect(a.units[3].kit).not.toEqual(b.units[3].kit);
    expect(drawMap(2, "flood", 0)).toBe("flood");
    expect(drawMap(3, "flood", 0)).toBe("city");
  });
  it("finishes a configured match reproducibly", () => {
    const a = createGame(5, config()),
      b = createGame(5, config());
    for (let i = 0; i < 1200; i++) {
      tick(a);
      tick(b);
    }
    expect(a).toEqual(b);
    expect(a.winner).toBeDefined();
  });
});
