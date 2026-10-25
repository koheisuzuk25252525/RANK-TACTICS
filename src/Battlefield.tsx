import { useEffect, useRef } from "react";
import { Application, Graphics, Text, Container } from "pixi.js";
import {
  Game,
  W,
  H,
  stats,
  clearShot,
  distance,
  OBJECTIVE,
  inCover,
  sightMap,
  los,
} from "./engine";
export function Battlefield({
  game,
  selected,
  onPoint,
  paused,
}: {
  game: Game;
  selected: number;
  onPoint: (x: number, y: number) => void;
  paused: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ game, selected, onPoint, paused });
  latest.current = { game, selected, onPoint, paused };
  useEffect(() => {
    const app = new Application();
    let disposed = false;
    const size = 24;
    const positions = new Map<number, { x: number; y: number }>();
    void app
      .init({
        width: W * size,
        height: H * size,
        background: "#09141f",
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.current?.appendChild(app.canvas);
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.objectFit = "contain";
        const graphics = new Graphics(),
          labels = new Container();
        app.stage.addChild(graphics, labels);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;
        app.stage.on("pointerdown", (e) => {
          const x = Math.floor(e.global.x / size),
            y = Math.floor(e.global.y / size);
          if (x >= 0 && x < W && y >= 0 && y < H) latest.current.onPoint(x, y);
        });
        const label = (
          text: string,
          x: number,
          y: number,
          color: number,
          fontSize = 12,
        ) => {
          const t = new Text({
            text,
            style: {
              fontFamily: "system-ui",
              fontSize,
              fontWeight: "bold",
              fill: color,
            },
          });
          t.anchor.set(0.5);
          t.position.set(x, y);
          labels.addChild(t);
        };
        app.ticker.add((ticker) => {
          const { game: g, selected: s, paused: p } = latest.current;
          const now = performance.now() / 1000;
          graphics.clear();
          for (const c of labels.removeChildren()) c.destroy();
          const allies = g.units.filter((u) => u.team === 0 && u.hp > 0);
          const visionMap = sightMap(g);
          const visible = (point: { x: number; y: number }) =>
            allies.some(
              (a) =>
                distance(a, point) <= stats[a.role].vision &&
                !g.smokes.some((s) => distance(s, a) <= 2) &&
                los(visionMap, a, point),
            );
          // Streets, sidewalks, roof machinery and windows are static decoration, not combat state.
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const wall = g.map[y * W + x],
                px = x * size,
                py = y * size;
              const seen = !wall && visible({ x, y });
              graphics
                .rect(px, py, size, size)
                .fill(wall ? 0x263747 : seen ? 0x223743 : 0x111f2a);
              if (wall) {
                graphics
                  .rect(px + 2, py + 2, size - 4, size - 4)
                  .fill(0x354a5b)
                  .rect(px + 5, py + 5, size - 10, size - 10)
                  .stroke({ color: 0x516371, width: 1 });
                if ((x + y) % 3 === 0)
                  graphics.rect(px + 7, py + 7, 9, 4).fill(0x71838a);
                if (!g.map[(y + 1) * W + x])
                  graphics.rect(px, py + size - 4, size, 4).fill(0x09121c);
              } else {
                graphics
                  .rect(px, py, size, size)
                  .stroke({ color: 0x6d8c9e, alpha: 0.07, width: 1 });
                if ((y === 10 || y === 19) && x % 3 === 0)
                  graphics
                    .rect(px + 6, py + 11, 12, 2)
                    .fill({ color: 0xabb69a, alpha: 0.28 });
                if ((x === 14 || x === 25) && y % 3 === 0)
                  graphics
                    .rect(px + 11, py + 6, 2, 12)
                    .fill({ color: 0xabb69a, alpha: 0.2 });
              }
            }
          const ox = (OBJECTIVE.x + 0.5) * size,
            oy = (OBJECTIVE.y + 0.5) * size;
          const controlColor =
            g.control === 0
              ? 0x62ded0
              : g.control === 1
                ? 0xff7865
                : g.control === 2
                  ? 0xffce70
                  : 0x9aafbd;
          graphics
            .circle(ox, oy, 3 * size)
            .fill({ color: controlColor, alpha: 0.055 })
            .stroke({ color: controlColor, width: 2, alpha: 0.6 })
            .circle(ox, oy, 23)
            .fill(0x172d3a)
            .stroke({ color: controlColor, width: 2 });
          graphics
            .rect(ox - 6, oy - 12, 12, 24)
            .fill(controlColor)
            .moveTo(ox, oy - 16)
            .lineTo(ox, oy - 23)
            .stroke({ color: controlColor, width: 2 });
          label("COMMS", ox, oy + 42, controlColor, 11);
          const selectedUnit = g.units.find((u) => u.id === s && u.hp > 0);
          if (selectedUnit) {
            const ux = (selectedUnit.x + 0.5) * size,
              uy = (selectedUnit.y + 0.5) * size;
            graphics
              .circle(ux, uy, stats[selectedUnit.role].range * size)
              .stroke({ color: 0x72d9cd, width: 1, alpha: 0.18 });
          }
          for (const c of g.intel[0])
            if (g.time - c.seen > 0.15) {
              graphics
                .circle((c.x + 0.5) * size, (c.y + 0.5) * size, 12)
                .stroke({ color: 0xaf846e, width: 1, alpha: 0.65 });
              label("?", (c.x + 0.5) * size, (c.y + 0.5) * size, 0xba9b85, 15);
            }
          for (const u of g.units) {
            if (u.team === 1 && !visible(u)) continue;
            const target = { x: (u.x + 0.5) * size, y: (u.y + 0.5) * size };
            let pos = positions.get(u.id);
            if (!pos || g.time === 0) {
              pos = { ...target };
              positions.set(u.id, pos);
            }
            const smoothing = p ? 1 : Math.min(1, ticker.deltaMS / 65);
            pos.x += (target.x - pos.x) * smoothing;
            pos.y += (target.y - pos.y) * smoothing;
            const x = pos.x,
              y = pos.y,
              color = u.team ? 0xff8e75 : 0x6fede0;
            if (u.hp <= 0) {
              graphics
                .circle(x, y, 11)
                .fill(0x181b20)
                .moveTo(x - 6, y - 6)
                .lineTo(x + 6, y + 6)
                .moveTo(x + 6, y - 6)
                .lineTo(x - 6, y + 6)
                .stroke({ color: 0x77828c, width: 3 });
              continue;
            }
            const aim = u.aim;
            if (aim) {
              const ax = (aim.at.x + 0.5) * size,
                ay = (aim.at.y + 0.5) * size,
                progress = 1 - aim.remaining / aim.duration;
              graphics
                .moveTo(x, y)
                .lineTo(ax, ay)
                .stroke({
                  color: u.team ? 0xff5c54 : 0xffdf85,
                  width: u.role === "sniper" ? 2 : 1,
                  alpha: 0.25 + progress * 0.55,
                });
              graphics
                .circle(ax, ay, 22 - progress * 12)
                .stroke({ color: u.team ? 0xff5c54 : 0xffdf85, width: 2 });
              if (u.role === "sniper")
                label("LOCK", ax, ay - 28, u.team ? 0xff8c79 : 0xffe1a0, 10);
            }
            if (u.id === s)
              graphics
                .circle(x, y, 20)
                .stroke({ color: 0xffdf85, width: 2 })
                .circle(x, y, 24)
                .stroke({ color: 0xffdf85, width: 1, alpha: 0.3 });
            if (u.hp < 35)
              graphics
                .circle(x, y, 22 + Math.sin(now * 7) * 3)
                .stroke({ color: 0xff554f, width: 2, alpha: 0.6 });
            graphics
              .ellipse(x + 3, y + 7, 14, 9)
              .fill({ color: 0x000000, alpha: 0.5 });
            const flash = g.time - u.hitAt < 0.2;
            graphics
              .roundRect(x - 11, y - 10, 22, 23, 5)
              .fill(flash ? 0xffffff : u.team ? 0xa94d41 : 0x267a80)
              .stroke({ color, width: 2 });
            graphics.circle(x, y - 6, 6).fill(color);
            let angle = u.team ? Math.PI : 0;
            if (aim) angle = Math.atan2(aim.at.y - u.y, aim.at.x - u.x);
            else if (u.order)
              angle = Math.atan2(u.order.y - u.y, u.order.x - u.x);
            graphics
              .moveTo(x, y)
              .lineTo(x + Math.cos(angle) * 19, y + Math.sin(angle) * 19)
              .stroke({ color: 0xd5e1e4, width: u.role === "sniper" ? 4 : 3 });
            label(
              { attacker: "A", gunner: "G", sniper: "S" }[u.role],
              x,
              y + 3,
              0xffffff,
              11,
            );
            graphics
              .roundRect(x - 14, y + 18, 28, 4, 2)
              .fill(0x1d141b)
              .rect(x - 14, y + 18, (28 * u.hp) / 100, 4)
              .fill(u.hp < 35 ? 0xff665a : color);
            if (inCover(g.map, u)) label("COVER", x, y - 22, 0x9dbfbc, 8);
            if (u.dashUntil > g.time)
              graphics.circle(x, y, 17).stroke({ color: 0x98d8ff, width: 2 });
            if (u.order && u.team === 0) {
              const ex = (u.order.x + 0.5) * size,
                ey = (u.order.y + 0.5) * size;
              graphics
                .moveTo(x, y)
                .lineTo(ex, ey)
                .stroke({ color: 0xffdf85, width: 1, alpha: 0.5 })
                .circle(ex, ey, 9)
                .stroke({ color: 0xffdf85, width: 2 })
                .moveTo(ex - 14, ey)
                .lineTo(ex + 14, ey)
                .moveTo(ex, ey - 14)
                .lineTo(ex, ey + 14)
                .stroke({ color: 0xffdf85, width: 1 });
            }
          }
          for (const smoke of g.smokes) {
            const age = 6 - (smoke.until - g.time);
            for (let i = 0; i < 7; i++) {
              const a = i * 2.4;
              const r = 19 + Math.sin(now + i) * 3;
              graphics
                .circle(
                  (smoke.x + 0.5) * size + Math.cos(a) * 24,
                  (smoke.y + 0.5) * size + Math.sin(a) * 24,
                  r * Math.min(1, age * 4 + 0.2),
                )
                .fill({ color: 0xb1c4cb, alpha: 0.25 });
            }
            label(
              "SMOKE",
              (smoke.x + 0.5) * size,
              (smoke.y + 0.5) * size,
              0xe2ecec,
              10,
            );
          }
          for (const e of g.effects) {
            if (!e.visible) continue;
            const age = g.time - e.time,
              x = (e.at.x + 0.5) * size,
              y = (e.at.y + 0.5) * size;
            if (e.kind === "shot" && age < 0.25 && e.from) {
              const fx = (e.from.x + 0.5) * size,
                fy = (e.from.y + 0.5) * size;
              graphics
                .moveTo(fx, fy)
                .lineTo(x, y)
                .stroke({
                  color: e.team ? 0xff8863 : 0xffe8a1,
                  width: 2,
                  alpha: 1 - age * 3,
                });
              graphics.circle(fx, fy, 9 * (1 - age * 3)).fill(0xffe4a0);
            }
            if ((e.kind === "hit" || e.kind === "kill") && age < 0.9) {
              const a = 1 - age / 0.9;
              graphics
                .circle(x, y, (e.kind === "kill" ? 45 : 20) * age + 5)
                .stroke({
                  color: e.kind === "kill" ? 0xffc18a : 0xffffff,
                  width: 3,
                  alpha: a,
                });
              for (let i = 0; i < 6; i++) {
                const theta = (i * Math.PI) / 3 + e.id;
                graphics
                  .circle(
                    x + Math.cos(theta) * age * 55,
                    y + Math.sin(theta) * age * 55,
                    2,
                  )
                  .fill({ color: 0xffbc78, alpha: a });
              }
              label(
                e.kind === "kill" ? "DOWN" : `−${e.damage}`,
                x,
                y - 28 - age * 30,
                e.team ? 0xffddad : 0xff8e7d,
                e.kind === "kill" ? 18 : 15,
              );
            }
            if (e.kind === "miss" && age < 0.6)
              label("MISS", x, y - 15 - age * 20, 0xaab9c4, 10);
            if (e.kind === "contact" && age < 1.4)
              graphics
                .circle(x, y, 18 + age * 30)
                .stroke({ color: 0xff9778, width: 2, alpha: 1 - age / 1.4 });
          }
        });
      });
    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);
  return (
    <div
      className="canvas"
      ref={host}
      aria-label="戦術マップ。味方を選び、空きマスで移動、視認中の敵で攻撃指示"
    />
  );
}
