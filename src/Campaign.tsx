import { useState } from "react";
import {
  defaultKits,
  drawMap,
  MapKind,
  MatchConfig,
  memberNames,
  maps,
  Plan,
  squads,
  triggers,
  Trigger,
  validateKits,
} from "./strategy";
export type Season = { round: number; points: number[]; results: string[] };
const fresh = (): Season => ({ round: 0, points: [0, 0, 0, 0], results: [] });
function saved() {
  try {
    const v = JSON.parse(localStorage.getItem("rank-season-v3") || "null");
    if (
      v &&
      Number.isInteger(v.round) &&
      v.round >= 0 &&
      v.round <= 3 &&
      v.points?.length === 4 &&
      v.points.every(
        (p: unknown) => typeof p === "number" && Number.isFinite(p),
      ) &&
      Array.isArray(v.results)
    )
      return v as Season;
  } catch {}
  return fresh();
}
function kitsSaved() {
  try {
    const v = JSON.parse(localStorage.getItem("rank-kits-v3") || "null");
    if (validateKits(v || [])) return v;
  } catch {}
  return defaultKits();
}
export function Campaign({
  children,
}: {
  children: (
    config: MatchConfig,
    seed: number,
    finish: (winner: number) => void,
  ) => React.ReactNode;
}) {
  const [season, setSeason] = useState<Season>(saved);
  const [kits, setKits] = useState(kitsSaved);
  const [pick, setPick] = useState<MapKind>("city");
  const [plan, setPlan] = useState<Plan>("center");
  const [focus, setFocus] = useState(0);
  const [member, setMember] = useState(0);
  const [match, setMatch] = useState<MatchConfig>();
  const [error, setError] = useState("");
  const seed = 2525 + season.round * 137,
    enemy = season.round % 3,
    arena = drawMap(seed, pick, enemy);
  function store(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setError(
        "ブラウザ保存を利用できません。この画面を開いている間は継続できます。",
      );
    }
  }
  function finish(winner: number) {
    const points = [...season.points];
    points[0] += winner === 0 ? 3 : winner === 2 ? 1 : 0;
    points[enemy + 1] += winner === 1 ? 3 : winner === 2 ? 1 : 0;
    const other = [1, 2, 3].filter((i) => i !== enemy + 1);
    points[other[season.round % 2]] += 3;
    const next = {
      round: season.round + 1,
      points,
      results: [
        ...season.results,
        `${squads[enemy].name}：${winner === 0 ? "勝利" : winner === 1 ? "敗北" : "引き分け"}`,
      ],
    };
    store("rank-season-v3", next);
    setSeason(next);
    setMatch(undefined);
  }
  if (match) return <>{children(match, seed, finish)}</>;
  return (
    <main className="briefing">
      <header>
        <div>
          <span className="eyebrow">RANK TACTICS / v0.3</span>
          <h1>作戦会議</h1>
        </div>
        <span>SEASON 01 · 第{Math.min(3, season.round + 1)}戦 / 3</span>
      </header>
      <div className="brief-grid">
        <section className="brief-card">
          <h2>順位表 / 勝利3・引分1</h2>
          {[0, 1, 2, 3]
            .sort((a, b) => season.points[b] - season.points[a])
            .map((id, i) => (
              <div className={`standing ${id === 0 ? "ours" : ""}`} key={id}>
                <b>
                  {1 +
                    season.points.filter((p) => p > season.points[id]).length}
                </b>
                <span>{id === 0 ? "あなたの隊" : squads[id - 1].name}</span>
                <strong>{season.points[id]} pt</strong>
              </div>
            ))}
          <small>同点は同順位。ほかの対戦は節ごとの固定結果です。</small>
          {season.results.map((r) => (
            <p key={r}>{r}</p>
          ))}
          {season.round >= 3 ? (
            <>
              <h2>シーズン終了</h2>
              <p>
                あなたの順位：
                {1 + season.points.filter((p) => p > season.points[0]).length}位
              </p>
              <button
                onClick={() => {
                  const s = fresh();
                  store("rank-season-v3", s);
                  setSeason(s);
                }}
              >
                次のシーズンへ
              </button>
            </>
          ) : (
            <>
              <h2>次の相手：{squads[enemy].name}</h2>
              <strong>{squads[enemy].style}</strong>
              <p>{squads[enemy].description}</p>
              <small>
                これは事前スカウティング情報です。現在位置は試合中の観測で判明します。
              </small>
            </>
          )}
        </section>
        <section className="brief-card">
          <h2>持ち寄りマップ抽選</h2>
          <label>
            自隊の提出{" "}
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value as MapKind)}
            >
              {Object.entries(maps).map(([k, v]) => (
                <option value={k} key={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <p>相手の提出：{maps[squads[enemy].map].name}</p>
          <div className="drawn">
            <small>抽選結果 / SEED {seed}</small>
            <strong>{maps[arena].name}</strong>
            <p>{maps[arena].description}</p>
          </div>
          <h2>開幕の散開</h2>
          <select
            aria-label="開幕作戦"
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
          >
            <option value="center">中央集中：通信局へ3名で前進</option>
            <option value="split">三方向：北・中央・南へ分散</option>
            <option value="hold">待ち受け：自陣の角で射線を作る</option>
          </select>
          <h2>優先して狙う相手</h2>
          <select
            aria-label="優先目標"
            value={focus}
            onChange={(e) => setFocus(Number(e.target.value))}
          >
            <option value={0}>相手隊長</option>
            <option value={1}>相手2番員</option>
            <option value={2}>相手3番員</option>
          </select>
          <p>観測できた時に優先。見えていない相手を追尾はしません。</p>
        </section>
        <section className="brief-card kit-editor">
          <h2>トリガーセット / 8枠</h2>
          <div className="controls">
            {memberNames.map((n, i) => (
              <button
                className={member === i ? "active" : ""}
                key={n}
                onClick={() => setMember(i)}
              >
                {n}
              </button>
            ))}
          </div>
          <p>各バンク4枠から1つずつ起動。同時使用は2つ。試合中も切替可能。</p>
          {["MAIN", "SUB"].map((bank, b) => (
            <div key={bank}>
              <h2>{bank} / 起動する枠を選択</h2>
              {[0, 1, 2, 3].map((i) => {
                const index = b * 4 + i,
                  k = kits[member];
                return (
                  <div className="slot" key={index}>
                    <input
                      type="radio"
                      aria-label={`${bank} ${i + 1}を起動`}
                      name={bank}
                      checked={(b ? k.sub : k.main) === index}
                      onChange={() =>
                        setKits(
                          kits.map((kit: typeof k, n: number) =>
                            n === member
                              ? { ...kit, [b ? "sub" : "main"]: index }
                              : kit,
                          ),
                        )
                      }
                    />
                    <span>{i + 1}</span>
                    <select
                      aria-label={`${bank} ${i + 1}の装備`}
                      value={k.slots[index]}
                      onChange={(e) =>
                        setKits(
                          kits.map((kit: typeof k, n: number) =>
                            n === member
                              ? {
                                  ...kit,
                                  slots: kit.slots.map(
                                    (t: Trigger, j: number) =>
                                      j === index
                                        ? (e.target.value as Trigger)
                                        : t,
                                  ),
                                }
                              : kit,
                          ),
                        )
                      }
                    >
                      {Object.entries(triggers).map(([t, [name]]) => (
                        <option value={t} key={t}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <small>{triggers[k.slots[index] as Trigger][1]}</small>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
      {season.round < 3 && (
        <button
          className="primary launch"
          onClick={() => {
            store("rank-kits-v3", kits);
            setMatch({
              map: arena,
              plan,
              enemy,
              kits: structuredClone(kits),
              focus,
            });
          }}
        >
          この装備と作戦で出撃
        </button>
      )}
      <p className="brief-note">
        攻撃は自律。勝ち筋は配置と情報。隠密はレーダーを消し、近距離では見破られます。攻撃後4秒は露見します。音声実況は未実装、解説席は観測に基づくテキストです。
      </p>
    </main>
  );
}
