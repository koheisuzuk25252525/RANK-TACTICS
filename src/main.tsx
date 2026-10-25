import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Battlefield } from "./Battlefield";
import {
  createGame,
  tick,
  command,
  score,
  LIMIT,
  Tactic,
  observe,
  stats,
  distance,
  los,
} from "./engine";
import "./style.css";
const names = {
  attacker: "アタッカー",
  gunner: "ガンナー",
  sniper: "スナイパー",
};
function App() {
  const ref = useRef(createGame());
  const [, render] = useState(0);
  const [selected, select] = useState(0);
  const [paused, pause] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState("2525");
  const [hint, setHint] = useState(
    "開始後、味方を選択してマップに指示できます",
  );
  const g = ref.current;
  const refresh = () => render((n) => n + 1);
  useEffect(() => {
    let accumulated = 0,
      last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (!paused) {
        accumulated += Math.min((now - last) / 1000, 0.25) * speed;
        while (accumulated >= 0.1) {
          tick(ref.current);
          accumulated -= 0.1;
        }
        refresh();
      }
      last = now;
    }, 33);
    return () => clearInterval(timer);
  }, [paused, speed]);
  const unit = g.units.find((u) => u.id === selected)!;
  function point(x: number, y: number) {
    const ally = g.units.find(
      (u) => u.team === 0 && u.hp > 0 && u.x === x && u.y === y,
    );
    if (ally) {
      select(ally.id);
      return;
    }
    observe(g, 0);
    const enemy = g.units.find(
      (u) =>
        u.team === 1 &&
        u.hp > 0 &&
        u.x === x &&
        u.y === y &&
        g.units.some(
          (a) =>
            a.team === 0 &&
            a.hp > 0 &&
            distance(a, u) <= stats[a.role].vision &&
            los(g.map, a, u),
        ),
    );
    if (enemy) {
      command(g, selected, { target: enemy.id });
      setHint("攻撃対象を指定しました。射程外では接近します");
    } else if (!g.map[y * 40 + x]) {
      command(g, selected, { move: { x, y } });
      setHint("移動先を指定しました。到着後は自律行動に戻ります");
    } else setHint("建物には移動できません");
    refresh();
  }
  function tactic(t: Tactic) {
    command(g, selected, { tactic: t });
    refresh();
  }
  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">TACTICAL SIMULATION / v0.1</span>
          <h1>
            RANK <b>TACTICS</b>
          </h1>
        </div>
        <div className="match">
          <span className="live">
            {g.winner !== undefined
              ? "終了"
              : paused
                ? "待機 / 一時停止"
                : "戦闘中"}
          </span>
          <strong>
            {Math.max(0, LIMIT - g.time).toFixed(1)}
            <small> SEC</small>
          </strong>
        </div>
      </header>
      <section className="toolbar">
        <div className="scores">
          <span>
            BLUE <b>{score(g, 0)}</b>
          </span>
          <span>
            RED <b>{score(g, 1)}</b>
          </span>
        </div>
        <div className="controls">
          <button
            className="primary"
            onClick={() => pause(!paused)}
            disabled={g.winner !== undefined}
          >
            {paused ? "開始 / 再開" : "一時停止"}
          </button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={s === speed ? "active" : ""}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <label>
          SEED{" "}
          <input
            aria-label="試合シード"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            ref.current = createGame(Number(seed) || 1);
            pause(true);
            select(0);
            refresh();
            setHint("新しい試合を準備しました");
          }}
        >
          新規試合
        </button>
      </section>
      <div className="layout">
        <section className="arena">
          <div className="maphead">
            <span>SECTOR 04 / 市街地</span>
            <span>40 × 30　遮蔽物あり</span>
          </div>
          <Battlefield game={g} selected={selected} onPoint={point} />
          <div className="mapfoot">
            <span>
              <i className="blue" /> 味方　
              <i className="red" /> 視認中の敵　 ? 最終確認地点（8秒）
            </span>
            <span>A 近接火力 / G 中距離 / S 長距離</span>
          </div>
          {g.winner !== undefined && (
            <div className="result">
              <span>MISSION COMPLETE</span>
              <h2>
                {g.winner === 2
                  ? "引き分け"
                  : g.winner === 0
                    ? "BLUE 勝利"
                    : "RED 勝利"}
              </h2>
              <p>
                {g.reason} · BLUE {score(g, 0)} / RED {score(g, 1)}
              </p>
              <p>撃破 100点 / 生存 50点（1名あたり）</p>
              <button
                onClick={() => {
                  ref.current = createGame(Number(seed) || 1);
                  pause(true);
                  refresh();
                }}
              >
                同じシードで再戦
              </button>
            </div>
          )}
        </section>
        <aside>
          <h2>部隊 / BLUE TEAM</h2>
          <div className="roster">
            {g.units
              .filter((u) => u.team === 0)
              .map((u) => (
                <button
                  disabled={u.hp <= 0}
                  className={`unit ${u.id === selected ? "selected" : ""}`}
                  key={u.id}
                  onClick={() => select(u.id)}
                >
                  <span className="badge">{u.role[0].toUpperCase()}</span>
                  <span>
                    <strong>{names[u.role]}</strong>
                    <small>
                      {u.hp > 0 ? `${u.hp} HP · ${u.kills} KILL` : "撃破"}
                    </small>
                    <meter value={u.hp} max={100} />
                  </span>
                </button>
              ))}
          </div>
          <h2>
            戦術指示 <span>選択した1名</span>
          </h2>
          <div className="tactics">
            {(
              [
                ["auto", "自律", "索敵し射程内で攻撃"],
                ["flank", "挟撃", "外周を経由して側面へ"],
                ["support", "援護", "アタッカーに追従し射撃"],
                ["ambush", "待ち伏せ", "その場で防御・射撃"],
              ] as const
            ).map(([t, n, d]) => (
              <button
                key={t}
                disabled={unit.hp <= 0}
                className={unit.tactic === t ? "active" : ""}
                onClick={() => tactic(t)}
              >
                <strong>{n}</strong>
                <small>{d}</small>
              </button>
            ))}
          </div>
          <p className="hint">{hint}</p>
          <h2>交戦記録</h2>
          <div className="logs">
            {g.events.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </aside>
      </div>
      <footer>
        <p>
          味方を選択 → 空きマスで移動 /
          視認中の敵で攻撃指示。移動指示は戦術より優先されます。
        </p>
        <p>
          制限120秒。撃破点＋生存点で決着 / リング＝防御（被ダメージ35%減） /
          横画面推奨
        </p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
