import { useEffect, useRef, useState } from "react";
import { Application, Graphics, Text, Container } from "pixi.js";
import { advance, ARENA, Duel as State, Input, newDuel, STEP } from "./duel";
import { playCombat, unlockAudio } from "./audio";
import "./duel.css";
const empty = (): Input => ({
  x: 0,
  y: 0,
  fire: false,
  slash: false,
  guard: false,
});
function Arena({ game, paused }: { game: State; paused: boolean }) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef({ game, paused });
  current.current = { game, paused };
  useEffect(() => {
    const app = new Application();
    let disposed = false;
    void app
      .init({
        width: ARENA.w,
        height: ARENA.h,
        background: "#0b1721",
        antialias: true,
        resolution: Math.min(2, devicePixelRatio || 1),
        autoDensity: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.current?.appendChild(app.canvas);
        const floor = new Graphics(),
          draw = new Graphics(),
          texts = new Container();
        app.stage.addChild(floor, draw, texts);
        floor.rect(0, 0, 960, 560).fill(0x0c1c28);
        for (let x = 0; x < 960; x += 40)
          floor
            .moveTo(x, 0)
            .lineTo(x, 560)
            .stroke({ color: 0x253a47, width: 1, alpha: 0.5 });
        for (let y = 0; y < 560; y += 40)
          floor
            .moveTo(0, y)
            .lineTo(960, y)
            .stroke({ color: 0x253a47, width: 1, alpha: 0.5 });
        floor
          .roundRect(22, 22, 916, 516, 16)
          .stroke({ color: 0x47616c, width: 2 })
          .circle(480, 280, 130)
          .stroke({ color: 0x365362, width: 2, alpha: 0.5 });
        for (const w of current.current.game.walls) {
          floor
            .roundRect(w.x + 6, w.y + 9, w.w, w.h, 5)
            .fill(0x050b12)
            .roundRect(w.x, w.y, w.w, w.h, 4)
            .fill(0x304955)
            .stroke({ color: 0x597680, width: 2 })
            .rect(w.x + 8, w.y + 8, w.w - 16, w.h - 16)
            .stroke({ color: 0x8d9f97, width: 1, alpha: 0.4 });
        }
        const heading = new Text({
          text: "SECTOR 01     /     CLOSE QUARTERS",
          style: {
            fontFamily: "system-ui",
            fontSize: 12,
            letterSpacing: 3,
            fill: 0x78949e,
          },
        });
        heading.position.set(35, 35);
        app.stage.addChild(heading);
        const label = (
          text: string,
          x: number,
          y: number,
          color: number,
          size = 18,
        ) => {
          const t = new Text({
            text,
            style: {
              fontFamily: "system-ui",
              fontWeight: "bold",
              fontSize: size,
              fill: color,
            },
          });
          t.anchor.set(0.5);
          t.position.set(x, y);
          texts.addChild(t);
        };
        app.ticker.add(() => {
          const g = current.current.game;
          draw.clear();
          for (const c of texts.removeChildren()) c.destroy();
          const time = g.time;
          const hit = [...g.effects]
            .reverse()
            .find((e) => e.kind === "hit" || e.kind === "parry");
          const shake =
            hit &&
            time - hit.time < 0.12 &&
            !current.current.paused &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches
              ? Math.sin(time * 230) * 3
              : 0;
          draw.position.set(shake, 0);
          if (g.telegraph) {
            const t = g.telegraph,
              e = g.e,
              col = t.kind === "slash" ? 0xff725d : 0xffbd73;
            draw
              .moveTo(e.x, e.y)
              .lineTo(
                e.x + Math.cos(t.angle) * 500,
                e.y + Math.sin(t.angle) * 500,
              )
              .stroke({ color: col, width: 2, alpha: 0.55 });
            if (t.kind === "slash")
              draw
                .arc(e.x, e.y, 145, t.angle - 1, t.angle + 1)
                .stroke({ color: col, width: 4, alpha: 0.7 });
            draw.circle(e.x, e.y, 33).stroke({ color: col, width: 3 });
            label(
              t.kind === "slash" ? "SLASH / 退避・盾" : "BURST / 横へ回避",
              e.x,
              e.y - 48,
              col,
              14,
            );
          }
          for (const [u, isEnemy] of [
            [g.p, false],
            [g.e, true],
          ] as const) {
            const color = isEnemy ? 0xff8269 : 0x72ecd8;
            draw
              .ellipse(u.x + 4, u.y + 10, 23, 13)
              .fill({ color: 0x000000, alpha: 0.5 });
            if (u.stun > 0)
              draw.circle(u.x, u.y, 30).stroke({ color: 0xffdd9d, width: 2 });
            if (u.counterUntil > time) {
              draw.circle(u.x, u.y, 31).stroke({ color: 0xffe19b, width: 3 });
              label("COUNTER", u.x, u.y - 42, 0xffdf97, 12);
            }
            draw
              .roundRect(u.x - 15, u.y - 14, 30, 29, 8)
              .fill(
                u.hitUntil > time ? 0xffffff : isEnemy ? 0x9e473e : 0x267677,
              )
              .stroke({ color, width: 2 });
            draw
              .circle(u.x, u.y - 5, 7)
              .fill(color)
              .moveTo(u.x, u.y)
              .lineTo(
                u.x + Math.cos(u.angle) * 27,
                u.y + Math.sin(u.angle) * 27,
              )
              .stroke({ color: 0xf2e5c6, width: 5 });
            if (u.guard) {
              const parry = u.parryUntil > time;
              draw
                .arc(u.x, u.y, 37, u.angle - 1.3, u.angle + 1.3)
                .stroke({
                  color: parry ? 0xffffff : 0x81bcff,
                  width: parry ? 8 : 5,
                });
              draw.circle(u.x, u.y, 30).fill({ color: 0x4b98ff, alpha: 0.12 });
            }
            draw
              .roundRect(u.x - 24, u.y + 29, 48, 5, 2)
              .fill(0x18202b)
              .rect(u.x - 24, u.y + 29, (48 * u.hp) / 100, 5)
              .fill(color);
            label(isEnemy ? "RIVAL" : "YOU", u.x, u.y + 46, color, 10);
          }
          for (const b of g.bullets)
            draw
              .moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025)
              .lineTo(b.x, b.y)
              .stroke({ color: b.team ? 0xff906c : 0xc6ffe7, width: 4 })
              .circle(b.x, b.y, 3)
              .fill(0xffffff);
          for (const e of g.effects) {
            const age = time - e.time,
              fade = Math.max(0, 1 - age / 0.5);
            if (e.kind === "slash" && age < 0.22) {
              draw
                .arc(e.x, e.y, 85 + age * 130, e.angle - 1.1, e.angle + 1.1)
                .stroke({
                  color: 0xe0ffea,
                  width: 12 * (1 - age / 0.23),
                  alpha: fade,
                });
              draw
                .arc(e.x, e.y, 98 + age * 130, e.angle - 0.9, e.angle + 0.9)
                .stroke({ color: 0x77edce, width: 3, alpha: fade });
            }
            if (e.kind === "parry") {
              draw
                .circle(e.x, e.y, 25 + age * 150)
                .stroke({ color: 0xf6ecb1, width: 4, alpha: fade });
              label("JUST!", e.x, e.y - 50 - age * 35, 0xffe19b, 24);
            }
            if (e.kind === "hit" || e.kind === "wall" || e.kind === "block") {
              for (let i = 0; i < 7; i++) {
                const a = i * 0.9 + e.id;
                draw
                  .circle(
                    e.x + Math.cos(a) * age * 120,
                    e.y + Math.sin(a) * age * 120,
                    2 + fade * 2,
                  )
                  .fill({
                    color: e.kind === "block" ? 0x91caff : 0xffd39a,
                    alpha: fade,
                  });
              }
            }
            if (e.kind === "shot" && age < 0.1)
              draw
                .circle(
                  e.x + Math.cos(e.angle) * 25,
                  e.y + Math.sin(e.angle) * 25,
                  9 * (1 - age * 10),
                )
                .fill(0xffe7a8);
          }
        });
      });
    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);
  return <div className="duel-canvas" ref={host} aria-label="1対1アリーナ" />;
}
export function Duel() {
  const ref = useRef(newDuel()),
    input = useRef(empty()),
    keys = useRef(new Set<string>()),
    touch = useRef(empty()),
    lastSound = useRef(-1);
  const [, refresh] = useState(0),
    [paused, setPaused] = useState(false),
    [sound, setSound] = useState(false),
    [stick, setStick] = useState({ x: 0, y: 0 });
  const g = ref.current;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const resetInputs = () => {
    touch.current = empty();
    input.current = empty();
    keys.current.clear();
    setStick({ x: 0, y: 0 });
  };
  useEffect(() => {
    let last = performance.now(),
      bank = 0,
      ui = 0;
    const loop = setInterval(() => {
      const now = performance.now(),
        elapsed = Math.min(0.08, (now - last) / 1000);
      last = now;
      if (paused) return;
      bank += elapsed;
      const k = keys.current,
        t = touch.current;
      input.current = {
        x:
          t.x +
          (k.has("d") || k.has("arrowright") ? 1 : 0) -
          (k.has("a") || k.has("arrowleft") ? 1 : 0),
        y:
          t.y +
          (k.has("s") || k.has("arrowdown") ? 1 : 0) -
          (k.has("w") || k.has("arrowup") ? 1 : 0),
        fire: t.fire || k.has("j"),
        slash: t.slash || k.has("k"),
        guard: t.guard || k.has("l") || k.has(" "),
      };
      while (bank >= STEP) {
        advance(ref.current, input.current);
        bank -= STEP;
      }
      for (const e of ref.current.effects)
        if (e.id > lastSound.current) {
          lastSound.current = e.id;
          if (soundRef.current && e.kind !== "wall")
            playCombat({
              id: e.id,
              kind:
                e.kind === "parry"
                  ? "contact"
                  : e.kind === "slash"
                    ? "kill"
                    : e.kind === "block"
                      ? "hit"
                      : e.kind,
              at: e,
              team: 0,
              visible: true,
              time: e.time,
            });
        }
      ui += elapsed;
      if (ui > 0.033) {
        refresh((n) => n + 1);
        ui = 0;
      }
    }, 8);
    return () => clearInterval(loop);
  }, [paused]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "j",
          "k",
          "l",
          " ",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        keys.current.add(e.key.toLowerCase());
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => {
      resetInputs();
      if (ref.current.started && !ref.current.winner) setPaused(true);
    };
    const hidden = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  function begin() {
    resetInputs();
    ref.current = newDuel();
    ref.current.started = true;
    lastSound.current = -1;
    setPaused(false);
    refresh((n) => n + 1);
    if (sound) unlockAudio();
  }
  const origin = useRef<{ id: number; x: number; y: number } | undefined>(
    undefined,
  );
  function stickMove(e: React.PointerEvent) {
    if (origin.current?.id !== e.pointerId) return;
    const dx = e.clientX - origin.current.x,
      dy = e.clientY - origin.current.y,
      scale = Math.max(44, Math.hypot(dx, dy));
    touch.current.x = dx / scale;
    touch.current.y = dy / scale;
    setStick({ x: (dx / scale) * 32, y: (dy / scale) * 32 });
  }
  function releaseStick(e: React.PointerEvent) {
    if (origin.current?.id === e.pointerId) {
      origin.current = undefined;
      touch.current.x = touch.current.y = 0;
      setStick({ x: 0, y: 0 });
    }
  }
  function action(kind: "fire" | "slash" | "guard") {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        touch.current[kind] = true;
      },
      onPointerUp: () => {
        touch.current[kind] = false;
      },
      onPointerCancel: () => {
        touch.current[kind] = false;
      },
      onLostPointerCapture: () => {
        touch.current[kind] = false;
      },
    };
  }
  return (
    <main className="duel-app">
      <header className="duel-header">
        <div>
          <span>RANK TACTICS / FEEL TEST 01</span>
          <strong>
            DUEL <b>LAB</b>
          </strong>
        </div>
        <div className="duel-timer">
          {Math.ceil(Math.max(0, 60 - g.time))
            .toString()
            .padStart(2, "0")}
          <small>SEC</small>
        </div>
        <div className="duel-tools">
          <button
            onClick={() => {
              if (!sound) unlockAudio();
              setSound(!sound);
            }}
          >
            音 {sound ? "ON" : "OFF"}
          </button>
          <button
            disabled={!g.started || !!g.winner}
            onClick={() => {
              resetInputs();
              setPaused(!paused);
            }}
          >
            {paused ? "再開" : "一時停止"}
          </button>
        </div>
      </header>
      <section className="duel-stage">
        <Arena game={g} paused={paused} />
        <div className="duel-bars">
          <div>
            <span>
              YOU <b>{g.p.hp}</b>
            </span>
            <meter min={0} max={100} value={g.p.hp} />
            <small>SHIELD {Math.ceil(g.p.energy)}%</small>
            <progress max={100} value={g.p.energy} />
          </div>
          <div className="rival-bar">
            <span>
              RIVAL <b>{g.e.hp}</b>
            </span>
            <meter min={0} max={100} value={g.e.hp} />
            <small>予兆は赤。射撃は横へ、斬撃は退避か盾。</small>
          </div>
        </div>
        {g.started && !g.winner && (
          <div
            className={`duel-notice ${g.p.counterUntil > g.time ? "counter" : ""}`}
            role="status"
          >
            {paused
              ? "PAUSED — 再開で続ける"
              : g.noticeUntil > g.time
                ? g.notice
                : g.telegraph?.kind === "slash"
                  ? "近接予兆 — 間合いの外へ / タイミングよく盾"
                  : g.telegraph
                    ? "射撃予兆 — 横へ動いて避ける"
                    : "照準は自動。自分で間合いを作る。"}
          </div>
        )}
        <div className="duel-inputs" aria-hidden={!g.started || !!g.winner}>
          <div className="move-control">
            <div
              className="joystick"
              role="region"
              aria-label="移動スティック"
              onPointerDown={(e) => {
                if (origin.current) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                origin.current = {
                  id: e.pointerId,
                  x: e.clientX,
                  y: e.clientY,
                };
                stickMove(e);
              }}
              onPointerMove={stickMove}
              onPointerUp={releaseStick}
              onPointerCancel={releaseStick}
              onLostPointerCapture={releaseStick}
            >
              <div
                style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
              />
              <span>MOVE</span>
            </div>
            <small>WASD / 矢印</small>
          </div>
          <div className="action-controls">
            <button
              className={`shoot ${touch.current.fire ? "held" : ""}`}
              aria-label="射撃 J"
              {...action("fire")}
            >
              <strong>射撃</strong>
              <small>長押し / J</small>
            </button>
            <button
              className={`blade ${g.p.cool > 0 ? "cooling" : ""}`}
              aria-label="斬撃 K"
              {...action("slash")}
            >
              <strong>斬撃</strong>
              <small>踏み込み / K</small>
            </button>
            <button
              className={`shield ${g.p.guard ? "held" : ""}`}
              aria-label="盾 L または Space"
              {...action("guard")}
            >
              <strong>盾</strong>
              <small>直前で弾く / L</small>
            </button>
          </div>
        </div>
        {(!g.started || g.winner) && (
          <div className="duel-overlay">
            <div className="duel-modal">
              <span className="duel-kicker">
                {g.winner
                  ? "ROUND COMPLETE"
                  : "v0.4 / DIRECT CONTROL PROTOTYPE"}
              </span>
              <h1>
                {g.winner ? (
                  g.winner === "you" ? (
                    "YOU WIN"
                  ) : g.winner === "enemy" ? (
                    "TRY AGAIN"
                  ) : (
                    "DRAW"
                  )
                ) : (
                  <>
                    避ける。詰める。
                    <br />
                    <em>斬り返す。</em>
                  </>
                )}
              </h1>
              {g.winner ? (
                <>
                  <p>
                    斬撃命中 {g.metrics.slashes} / 射撃命中 {g.metrics.shots}
                    <br />
                    ジャストガード {g.metrics.parries} / 防御 {g.metrics.blocks}
                  </p>
                  <p>
                    {g.metrics.parries
                      ? "盾で弾いた後の1.8秒が、強化斬撃のチャンス。"
                      : "盾は押しっぱなしより、着弾直前に押すと切り返せる。"}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    1対1、60秒。残りHPが多い方の勝ち。
                    <br />
                    照準は自動。移動と攻撃のタイミングはあなたが決める。
                  </p>
                  <div className="duel-rules">
                    <span>
                      <b>01 / 刃</b>近づいて踏み込む。高威力の一撃。
                    </span>
                    <span>
                      <b>02 / 弾</b>距離を保って射撃。弾道を見て回避。
                    </span>
                    <span>
                      <b>03 / 盾</b>直前で弾くと、次の斬撃を強化。
                    </span>
                  </div>
                </>
              )}
              <button className="duel-start" onClick={begin}>
                {g.winner ? "もう一度、試す" : "アリーナに入る"}
              </button>
              <small className="duel-help">
                スマホ：横画面・左スティック＋右ボタン
                <br />
                Mac：WASDで移動 / J射撃 / K斬撃 / L・Space盾
              </small>
              <a href="?mode=strategy">v0.3 戦術シミュレーションへ</a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
