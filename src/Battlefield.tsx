import { useEffect, useRef } from "react";
import { Application, Graphics, Text, Container } from "pixi.js";
import { Game, W, H, stats, los, distance } from "./engine";
export function Battlefield({
  game,
  selected,
  onPoint,
}: {
  game: Game;
  selected: number;
  onPoint: (x: number, y: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ game, selected, onPoint });
  latest.current = { game, selected, onPoint };
  useEffect(() => {
    const app = new Application();
    let disposed = false;
    const size = 24;
    void app
      .init({
        width: W * size,
        height: H * size,
        background: "#0d1824",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
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
        const graphics = new Graphics();
        const labels = new Container();
        app.stage.addChild(graphics, labels);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;
        app.stage.on("pointerdown", (e) => {
          latest.current.onPoint(
            Math.floor(e.global.x / size),
            Math.floor(e.global.y / size),
          );
        });
        app.ticker.add(() => {
          const { game: g, selected: s } = latest.current;
          graphics.clear();
          for (const child of labels.removeChildren()) child.destroy();
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const block = g.map[y * W + x];
              graphics
                .rect(x * size, y * size, size - 1, size - 1)
                .fill(block ? 0x354758 : (x + y) % 2 ? 0x132333 : 0x142536);
              if (block)
                graphics
                  .rect(x * size + 4, y * size + 4, size - 9, size - 9)
                  .stroke({ color: 0x536779, width: 1 });
            }
          const allies = g.units.filter((u) => u.team === 0 && u.hp > 0);
          for (const c of g.intel[0])
            if (g.time - c.seen > 0.15) {
              graphics
                .circle((c.x + 0.5) * size, (c.y + 0.5) * size, 8)
                .stroke({ color: 0xb66b5a, width: 2 });
              const t = new Text({
                text: "?",
                style: { fontSize: 14, fill: 0xd79b84 },
              });
              t.position.set(c.x * size + 8, c.y * size + 3);
              labels.addChild(t);
            }
          for (const u of g.units) {
            if (
              u.team === 1 &&
              !allies.some(
                (a) =>
                  u.hp > 0 &&
                  distance(a, u) <= stats[a.role].vision &&
                  los(g.map, a, u),
              )
            )
              continue;
            const x = (u.x + 0.5) * size,
              y = (u.y + 0.5) * size;
            if (u.hp <= 0) {
              graphics
                .moveTo(x - 5, y - 5)
                .lineTo(x + 5, y + 5)
                .moveTo(x + 5, y - 5)
                .lineTo(x - 5, y + 5)
                .stroke({ color: 0x627183, width: 2 });
              continue;
            }
            if (u.id === s)
              graphics.circle(x, y, 14).stroke({ color: 0xf6d579, width: 2 });
            graphics.circle(x, y, 10).fill(u.team ? 0xef775f : 0x5ccecf);
            if (u.guard)
              graphics.circle(x, y, 12).stroke({ color: 0xb6cce0, width: 1 });
            graphics
              .rect(x - 10, y + 13, 20, 3)
              .fill(0x412c34)
              .rect(x - 10, y + 13, u.hp / 5, 3)
              .fill(u.team ? 0xef775f : 0x5ccecf);
            const text = new Text({
              text: { attacker: "A", gunner: "G", sniper: "S" }[u.role],
              style: { fontSize: 13, fontWeight: "bold", fill: 0x08131e },
            });
            text.anchor.set(0.5);
            text.position.set(x, y);
            labels.addChild(text);
            if (u.order && u.team === 0)
              graphics
                .moveTo(x, y)
                .lineTo((u.order.x + 0.5) * size, (u.order.y + 0.5) * size)
                .stroke({ color: 0xf6d579, width: 2, alpha: 0.6 });
          }
          for (const shot of g.shots)
            graphics
              .moveTo((shot.from.x + 0.5) * size, (shot.from.y + 0.5) * size)
              .lineTo((shot.to.x + 0.5) * size, (shot.to.y + 0.5) * size)
              .stroke({ color: 0xffe0a0, width: 3 });
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
