import { Campaign } from "./Campaign";
import { Commentary } from "./Commentary";
import { MatchConfig, memberNames, triggers, maps } from "./strategy";
import { canSee } from "./engine";
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
  clearShot,
  inCover,
} from "./engine";
import "./style.css";
import { unlockAudio, playCombat } from "./audio";
const names = {
  attacker: "アタッカー",
  gunner: "ガンナー",
  sniper: "スナイパー",
};
function App({
  config,
  initialSeed,
  onFinish,
}: {
  config: MatchConfig;
  initialSeed: number;
  onFinish: (winner: number) => void;
}) {
  const ref = useRef(createGame(initialSeed, config));
  const [, render] = useState(0);
  const [selected, select] = useState(0);
  const [paused, pause] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(false);
  const played = useRef(-1);
  const [seed, setSeed] = useState(String(initialSeed));
  const [hint, setHint] = useState(
    "中央の通信局を確保。赤いLOCKが出たら移動か煙幕で退避",
  );
  const g = ref.current;
  useEffect(() => {
    if (g.time === 0) played.current = -1;
    for (const event of g.effects) {
      if (event.id > played.current && event.visible && sound)
        playCombat(event);
      played.current = Math.max(played.current, event.id);
    }
  }, [g, g.time, sound]);
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
  useEffect(() => {
    if (g.units[selected]?.hp <= 0) {
      const alive = g.units.find((u) => u.team === 0 && u.hp > 0);
      if (alive) select(alive.id);
    }
  }, [g, g.time, selected]);
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
        g.units.some((a) => a.team === 0 && a.hp > 0 && canSee(g, 0, u)),
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
    <main className={g.time >= 90 ? "endgame" : ""}>
      <header>
        <div>
          <span className="eyebrow">RANK SEASON / v0.3</span>
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
      <section className="missionbar">
        <div>
          <span className="missionlabel">MISSION 01 / DEAD SIGNAL</span>
          <strong>通信局を確保せよ</strong>
          <small>確保 +3点/秒 ・ 残り30秒は得点2倍</small>
        </div>
        <div className={`controlstate state${g.control}`}>
          {g.control === 2
            ? "交戦中 / 確保阻止"
            : g.control === 0
              ? "BLUE 確保中"
              : g.control === 1
                ? "RED 確保中"
                : "通信局 未確保"}
          <small>
            確保点 BLUE {Math.floor(g.objective[0])} : RED{" "}
            {Math.floor(g.objective[1])}
          </small>
        </div>
      </section>
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
        <button
          className="sound"
          onClick={() => {
            if (!sound) unlockAudio();
            setSound(!sound);
          }}
        >
          音 {sound ? "ON" : "OFF"}
        </button>
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
            ref.current = createGame(Number(seed) || 1, config);
            pause(true);
            select(0);
            setSpeed(1);
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
            <span>{maps[config.map].name}</span>
            <span>40 × 30　遮蔽物あり</span>
          </div>
          <div
            className={`combat-alert ${g.units.some((u) => u.team === 0 && u.hp > 0 && u.hp < 35) ? "critical" : ""}`}
            role="status"
          >
            {g.winner !== undefined
              ? "作戦終了"
              : paused
                ? "TACTICAL PAUSE — 時間を止めて指示できます"
                : g.units.some((u) => u.team === 0 && u.hp > 0 && u.hp < 35)
                  ? "味方が危険 — 煙幕を展開して退避せよ"
                  : g.effects.some(
                        (e) => e.kind === "contact" && g.time - e.time < 2,
                      )
                    ? "CONTACT — 敵影を確認"
                    : g.time >= 90
                      ? "FINAL 30 — 通信局の確保点が2倍"
                      : g.control === 1
                        ? "敵が通信局を確保 — このままでは得点差が広がります"
                        : "通信局へ前進 — 建物の縁で被ダメージ軽減"}
          </div>
          <Battlefield
            game={g}
            selected={selected}
            onPoint={point}
            paused={paused}
          />
          <div className="mapfoot">
            <span>
              <i className="blue" /> 味方　
              <i className="red" /> 視認中の敵　 ? 最終確認地点（8秒）
            </span>
            <span>赤いLOCK＝狙撃予兆 / COVER＝遮蔽物 / 円＝射程</span>
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
              <p>撃破100点 + 生存50点/名 + 通信局確保点</p>
              <button
                onClick={() => {
                  ref.current = createGame(Number(seed) || 1, config);
                  pause(true);
                  select(0);
                  setSpeed(1);
                  refresh();
                }}
              >
                同じシードで再戦
              </button>
              <button className="primary" onClick={() => onFinish(g.winner!)}>
                結果を記録して作戦会議へ
              </button>
            </div>
          )}
        </section>
        <aside>
          <Commentary game={g} />
          <h2>起動トリガー / {memberNames[unit.id]}</h2>
          <div className="battle-slots">
            {unit.kit?.slots.map((t, i) => (
              <button
                key={i}
                disabled={unit.hp <= 0 || g.winner !== undefined}
                className={
                  unit.kit?.main === i || unit.kit?.sub === i ? "active" : ""
                }
                onClick={() => {
                  command(g, selected, { slot: i });
                  refresh();
                }}
              >
                <small>
                  {i < 4 ? "M" : "S"}
                  {(i % 4) + 1}
                </small>
                {triggers[t][0]}
              </button>
            ))}
          </div>
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
                  <span className="badge">{u.id + 1}</span>
                  <span>
                    <strong>{memberNames[u.id]}</strong>
                    <small>
                      {u.hp > 0 ? `${u.hp} HP · ${u.kills} KILL` : "撃破"}
                    </small>
                    <meter value={u.hp} max={100} />
                    <small className={u.hp < 35 ? "wounded" : ""}>
                      {u.hp <= 0
                        ? "通信途絶"
                        : u.aim
                          ? "照準中"
                          : u.order
                            ? "移動指示中"
                            : inCover(g.map, u)
                              ? "遮蔽物に隣接"
                              : u.tactic === "ambush"
                                ? "待ち伏せ中"
                                : "索敵 / 交戦"}
                    </small>
                  </span>
                </button>
              ))}
          </div>
          <h2>
            緊急アクション <span>{memberNames[unit.id]}</span>
          </h2>
          <div className="abilities">
            <button
              disabled={
                unit.hp <= 0 ||
                g.winner !== undefined ||
                g.time < unit.dashReady ||
                !unit.kit?.slots.includes("dash")
              }
              onClick={() => {
                command(g, selected, { ability: "dash" });
                setHint("ダッシュ発動。マップで退避先を指定してください");
                refresh();
              }}
            >
              <strong>ダッシュ</strong>
              <small>
                {g.time < unit.dashReady
                  ? `${Math.ceil(unit.dashReady - g.time)}秒で再使用`
                  : "2.5秒加速 / 再使用12秒"}
              </small>
            </button>
            <button
              disabled={
                unit.hp <= 0 ||
                g.winner !== undefined ||
                unit.smokeLeft === 0 ||
                !unit.kit?.slots.includes("smoke")
              }
              onClick={() => {
                command(g, selected, { ability: "smoke" });
                setHint("煙幕展開。敵味方の視界を遮断します。今のうちに移動を");
                refresh();
              }}
            >
              <strong>
                煙幕 <b>×{unit.smokeLeft}</b>
              </strong>
              <small>6秒間、射線を切る / 1回</small>
            </button>
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
          制限120秒。撃破＋生存＋通信局確保点で決着 / COVER＝被ダメージ35%減 /
          横画面推奨
        </p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Campaign>
      {(config, seed, finish) => (
        <App config={config} initialSeed={seed} onFinish={finish} />
      )}
    </Campaign>
  </React.StrictMode>,
);
