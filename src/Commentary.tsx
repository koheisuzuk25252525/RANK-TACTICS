import { useEffect, useState } from "react";
import { Game, distance } from "./engine";
import { memberNames, squads } from "./strategy";
export function analysis(g: Game): { speaker: string; text: string } {
  const contacts = g.intel[0].filter((c) => g.time - c.seen < 0.2),
    visible = contacts.filter((c) => !c.radar),
    allies = g.units.filter((u) => !u.team && u.hp > 0);
  const isolated = allies.find(
    (a) =>
      a.hp < 55 && !allies.some((b) => a.id !== b.id && distance(a, b) < 8),
  );
  if (isolated)
    return {
      speaker: "解説 / 配置",
      text: `${memberNames[isolated.id]}が孤立し、耐久も低下しています。近くに援護役がいません。交戦を続けるより合流を。`,
    };
  if (
    g.control === 0 &&
    visible.every((c) => distance(c, { x: 20, y: 14 }) > 5)
  )
    return {
      speaker: "解説 / 読み",
      text: "観測中の敵が中央に届いていない間に通信局を確保。空いた場所を取る配置が得点になっています。ただし未確認の敵は警戒を。",
    };
  if (g.control === 1)
    return {
      speaker: "実況",
      text: "相手の確保点が伸びています。全員を追撃に回さず、1名を通信局へ送れば加点を止められます。",
    };
  if (contacts.length < 3 && g.time > 5)
    return {
      speaker: "オペレーター",
      text: `現在の反応は${contacts.length}名、うち目視${visible.length}名。残りの位置は不明です。撃破・隠密・範囲外の区別はできません。裏取りを断定しないでください。`,
    };
  if (contacts.some((c) => c.radar))
    return {
      speaker: "オペレーター",
      text: "壁越しにレーダー反応。表示は約4マス単位で、射撃できる精度ではありません。角を曲がる前に目視確認を。",
    };
  return {
    speaker: "解説 / 作戦",
    text: `${g.config ? squads[g.config.enemy].name : "相手隊"}との間合いを測る時間です。盾は火力、隠密は防御との交換。何を起動するかを位置取りに合わせましょう。`,
  };
}
export function Commentary({ game }: { game: Game }) {
  const [history, setHistory] = useState<
    { speaker: string; text: string; time: number }[]
  >([]);
  const window = Math.floor(game.time / 5);
  useEffect(() => {
    const next = { ...analysis(game), time: game.time };
    setHistory((old) =>
      game.time === 0
        ? [next]
        : old[0]?.text === next.text
          ? old
          : [next, ...old].slice(0, 4),
    );
  }, [game, window]);
  const line = history[0] ?? analysis(game);
  return (
    <section className="commentary-desk" aria-live="polite">
      <small>{line.speaker}</small>
      <p>{line.text}</p>
      <div>
        共有情報：目視{" "}
        {
          game.intel[0].filter((c) => !c.radar && game.time - c.seen < 0.2)
            .length
        }{" "}
        / レーダー{" "}
        {
          game.intel[0].filter((c) => c.radar && game.time - c.seen < 0.2)
            .length
        }{" "}
        / 未確認の位置は表示しません
      </div>
      {history.slice(1, 3).map((h) => (
        <details key={h.time}>
          <summary>
            {h.time.toFixed(0)}秒 · {h.speaker}
          </summary>
          <p>{h.text}</p>
        </details>
      ))}
    </section>
  );
}
