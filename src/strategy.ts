export const triggers = {
  empty: ["空き", "消費なし"],
  blade: ["近接刃", "射程5 / 高威力"],
  rifle: ["直射弾", "射程9 / 標準"],
  sniper: ["狙撃銃", "射程16 / 長い照準"],
  burst: ["範囲弾", "射程7 / 着弾周囲2マス"],
  shield: ["シールド", "被ダメージ軽減。両手使用でさらに強化"],
  stealth: ["隠密", "レーダーから消失。目視は2マスまで / 攻撃すると解除"],
  sensor: ["レーダー", "壁越しに約4マス単位の反応を共有"],
  smoke: ["煙幕", "一度だけ視界を遮断"],
  dash: ["機動", "ダッシュ使用可能"],
} as const;
export type Trigger = keyof typeof triggers;
export type Kit = { slots: Trigger[]; main: number; sub: number };
export type MapKind = "city" | "night" | "flood";
export type Plan = "center" | "split" | "hold";
export type MatchConfig = {
  map: MapKind;
  plan: Plan;
  enemy: number;
  kits: Kit[];
  focus: number;
};
export const maps: Record<MapKind, { name: string; description: string }> = {
  city: {
    name: "旧市街 / 昼",
    description: "建物の角が多い。分断と遮蔽を使う基本マップ",
  },
  night: {
    name: "停電街 / 夜",
    description: "視認距離6マス。レーダーと隠密の読み合い",
  },
  flood: {
    name: "水没区",
    description: "中央帯の移動が遅い。水中の狙撃射程・威力が低下",
  },
};
export const squads = [
  {
    name: "遠見隊",
    style: "狙撃主体",
    description: "両翼の長距離射撃で進路を制限する",
    map: "city" as MapKind,
  },
  {
    name: "烈火隊",
    style: "隊長突撃",
    description: "隊長が先行し、後衛2人が追従する",
    map: "flood" as MapKind,
  },
  {
    name: "静波隊",
    style: "生存重視",
    description: "隠密で進出し、中央を盾で保持する",
    map: "night" as MapKind,
  },
];
export const memberNames = ["ナギ", "レン", "シオ"];
export function defaultKits(): Kit[] {
  return [
    {
      slots: [
        "blade",
        "rifle",
        "dash",
        "shield",
        "shield",
        "stealth",
        "smoke",
        "sensor",
      ],
      main: 0,
      sub: 4,
    },
    {
      slots: [
        "rifle",
        "burst",
        "shield",
        "dash",
        "sensor",
        "shield",
        "smoke",
        "stealth",
      ],
      main: 0,
      sub: 4,
    },
    {
      slots: [
        "sniper",
        "rifle",
        "shield",
        "dash",
        "stealth",
        "shield",
        "sensor",
        "smoke",
      ],
      main: 0,
      sub: 4,
    },
  ];
}
export function active(kit: Kit | undefined): Trigger[] {
  return kit ? [kit.slots[kit.main], kit.slots[kit.sub]] : [];
}
export function validateKits(kits: Kit[]) {
  return (
    kits.length === 3 &&
    kits.every(
      (k) =>
        k.slots.length === 8 &&
        k.slots.every((t) => t in triggers) &&
        Number.isInteger(k.main) &&
        k.main >= 0 &&
        k.main < 4 &&
        Number.isInteger(k.sub) &&
        k.sub >= 4 &&
        k.sub < 8,
    )
  );
}
export function drawMap(seed: number, own: MapKind, enemy: number): MapKind {
  return (seed >>> 0) % 2 === 0 ? own : squads[enemy].map;
}
