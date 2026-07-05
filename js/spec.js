/* =========================================================
 * CR常総学院 〜青春御伽769ver.〜  スペック＆データ定義
 * 出玉スペックは「e Re:ゼロから始める異世界生活 season2」準拠
 * （ミドルタイプ・RUSH突入で約3000個獲得のワンセット型）
 * ======================================================= */

const SPEC = {
  // 大当り確率
  NORMAL_PROB: 1 / 349.9,   // 通常時（ヘソ）
  RUSH_PROB:   1 / 99.9,    // RUSH中（電チュー・高確率）

  // 振り分け（ヘソ）
  HESO_RUSH_RATE: 0.55,     // 55%: 10R×2+RUSH145 / 45%: 10R単発（時短なし）

  // 振り分け（RUSH中・電チュー）
  RUSH_DOUBLE_RATE: 0.25,   // 25%: 10R×2+α
  RUSH_SINGLE_RATE: 0.55,   // 55%: 10R（残り20%: 2R）すべてRUSH継続

  ST_COUNT: 145,            // 常総RUSH（高確率時短）回数 → 継続率 約77%

  // 出玉（賞球 1&4&15 / 10C）
  ROUND_CATCH: 10,          // 1Rあたりのカウント数
  ATTACKER_PAY: 15,         // アタッカー賞球
  HESO_PAY: 1,              // ヘソ賞球
  DENCHU_PAY: 4,            // 電チュー賞球

  START_BALLS: 1000,
  LEND_BALLS: 500,

  ROUND_TIMEOUT_MS: 25000,  // ラウンド最大時間
};

/* 大当り種別（グレード）抽選：変動開始時のモードで決定 */
function decideGrade(isRushMode) {
  if (isRushMode) {
    const r = Math.random();
    if (r < SPEC.RUSH_DOUBLE_RATE) return "double";                    // 10R×2+α
    if (r < SPEC.RUSH_DOUBLE_RATE + SPEC.RUSH_SINGLE_RATE) return "single"; // 10R
    return "mini";                                                     // 2R
  }
  return Math.random() < SPEC.HESO_RUSH_RATE ? "double" : "tanpatsu";  // 10R×2+RUSH or 10R単発
}

/* グレードごとの内容定義 */
const GRADES = {
  double:   { sets: 2, rounds: 10, next: "rush",   label: "10R×2 約3000個" },
  single:   { sets: 1, rounds: 10, next: "rush",   label: "10R RUSH継続" },
  mini:     { sets: 1, rounds: 2,  next: "rush",   label: "2R RUSH継続" },
  tanpatsu: { sets: 1, rounds: 10, next: "normal", label: "10R 単発" },
};

/* ---------- 図柄キャラクター（1〜8） ----------
 * 奇数図柄で揃えば 10R+RUSH 確定！ */
const CHARACTERS = [
  { num: 1, key: "kuno",      name: "久野恭一郎", img: "assets/character/久野.png",   quote: "うおおおおい！！聞いてくれ！！" },
  { num: 2, key: "akagami",   name: "赤上あおい", img: "assets/character/赤上.png",   quote: "いやー委員長とか俺キャラじゃないって" },
  { num: 3, key: "ishikawa",  name: "石川竜星",   img: "assets/character/石川.png",   quote: "は？論理的に考えて俺が正しいんだが" },
  { num: 4, key: "nishiyama", name: "西山君",     img: "assets/character/西山.png",   quote: "石川、お前それ昨日と言ってること違うぞ" },
  { num: 5, key: "kojima",    name: "小島大輝",   img: "assets/character/小島.png",   quote: "これ、ニコニコで見たやつだ" },
  { num: 6, key: "yabuki",    name: "矢吹ゆずる", img: "assets/character/矢吹.png",   quote: "……別にいいだろ、どこで食っても" },
  { num: 7, key: "kotan",     name: "小丹雄登",   img: "assets/character/小丹.png",   quote: "それ、宇宙世紀で例えると…" },
  { num: 8, key: "chinone",   name: "ちのね かい", img: "assets/character/ちのね.png", quote: "大森くん！大森君！" },
];

const CHIBI_IMGS = ["assets/character/ちびきゃら01.png", "assets/character/ちびキャラ02.png"];

/* ---------- 背景 ---------- */
const BGS = {
  // 常総学院シミュレーターより
  classroom: "assets/bg/教室.jpg",
  gym:       "assets/bg/体育館.jpg",
  train:     "assets/bg/常磐線.jpg",
  trainIn:   "assets/bg/常磐線車内.jpg",
  entrance:  "assets/bg/昇降口.jpg",
  hall:      "assets/bg/生徒ホール.jpg",
  pc:        "assets/bg/パソコン室.jpg",
  library:   "assets/bg/図書室.jpg",
  school:    "assets/bg/中等部校舎前.jpg",
  station:   "assets/bg/土浦駅.jpg",
  // OKUMONO
  skyField:  "assets/bg/okumono_sky_sougen.png",
  nightMoon: "assets/bg/okumono_night_moon.png",
  cyber1:    "assets/bg/okumono_cyber1.png",
  cyber2:    "assets/bg/okumono_cyber2.png",
  wafuUme:   "assets/bg/okumono_wafu_ume.png",
  wafuKirei: "assets/bg/okumono_wafu_kirei.png",
  // Pixabay
  skyClouds: "assets/bg/pixabay_sky_clouds.jpg",
  skyBlue:   "assets/bg/pixabay_sky_blue.jpg",
};

/* 光エフェクト（OKUMONO） */
const FX_IMGS = {
  kiraLine1: "assets/fx/okumono_kira_line1.png",
  kiraLine2: "assets/fx/okumono_kira_line2.png",
};

/* 演出動画（動画AC）
 * movie/ フォルダに同名ファイルを置くと自動で有効になる（無ければスキップ） */
const VIDEO_FX = {
  kiraBlue:  "movie/勢いのあるキラキラブルー背景.mp4",   // 汎用キラキラ背景
  cutinRed:  "movie/赤色の斜めカットインエフェクト.mp4", // 激アツカットイン
  cutinBlue: "movie/青色のカットインエフェクト.mp4",     // 通常カットイン
  gekiha:    "movie/撃破３D文字アニメーション.mp4",       // 当り決着
  jikai:     "movie/次回３D文字アニメーション.mp4",       // ハズレ決着
};

/* ---------- SPリーチ定義 ----------
 * winRate は「当たり変動のうちこのリーチが選ばれた際の表示強度」の目安 */
const SP_REACHES = [
  {
    id: "kouron", title: "口論バトル 石川 VS 西山", bg: "imagin/口論バトル 石川VS西山.png",
    chars: ["ishikawa", "nishiyama"], grade: "strong",
    lines: ["帰りの常磐線、今日も口論が始まった……", "「は？論理的に考えて俺が正しいんだが」", "「お前それ昨日と言ってること違うぞ！」", "決着の行方は──"],
  },
  {
    id: "test", title: "定期テスト 学年一位への道", bg: BGS.classroom,
    chars: ["kotan"], grade: "mid",
    lines: ["定期テスト最終日。最後の科目が始まる──", "「それ、宇宙世紀で例えると…」", "残り時間わずか！ 最後の一問に挑む！"],
  },
  {
    id: "dash", title: "常磐線 遅延ダッシュ", bg: "imagin/常磐線 遅延ダッシュ.png",
    chars: ["yabuki"], grade: "mid",
    lines: ["電車が遅延！ 遅刻の危機──", "「……別にいいだろ、どこで食っても」", "土浦駅の階段を駆け上がれ！"],
  },
  {
    id: "taiiku", title: "体育祭 大声援リレー", bg: "assets/bg/okumono_sky_sougen.png",
    chars: ["kuno"], grade: "strong",
    lines: ["体育祭、クラス対抗リレー最終走者！", "「うおおおおい！！聞いてくれ！！」", "大声援がグラウンドを揺らす──！"],
  },
  {
    id: "nico", title: "パソコン室 動画鑑賞会", bg: BGS.pc,
    chars: ["kojima"], grade: "mid",
    lines: ["放課後のパソコン室に集合──", "「これ、ニコニコで見たやつだ」", "先生に見つかる前にミッション完了なるか！？"],
  },
];

/* SPSPリーチ（発展・最終決戦） */
const SPSP_REACH = {
  id: "seitokai", title: "生徒会長決戦 小丹 VS 伊藤輝明", bg: BGS.school,
  chars: ["kotan"], grade: "max",
  lines: ["全校生徒が見守る、生徒会長選挙──", "演説が校舎前に響き渡る！", "常総学院の未来を懸けた最終決戦！！"],
};

/* 激熱確定背景（出現＝大当り確定のプレミア背景） */
const CONFIRM_BG = "imagin/激熱確定背景_ちのね.png";

/* 群予告の出現判定（当落連動で信頼度を約60%に） */
function decideMob(isWin, isRush) {
  const pWin  = isRush ? 0.60 : 0.66;    // 当たり時に群予告が出る率
  const pLose = isRush ? 0.006 : 0.0012;  // ハズレ時に群予告が出る率（低く抑える）
  return Math.random() < (isWin ? pWin : pLose);
}

/* 確定背景の出現判定（当たり時のみ・7図柄なら必ず） */
function decideConfirm(isWin, symbols) {
  if (!isWin) return false;
  if (symbols[0] === 6 && symbols[2] === 6) return true; // 7図柄テンパイ＝必ず確定背景
  return Math.random() < 0.12;                           // その他の当たりは12%でプレミア出現
}

/* ---------- 保留色 ---------- */
const HOLD_COLORS = [
  { id: "white",  css: "#e8e8e8", label: "白" },
  { id: "blue",   css: "#3fa7ff", label: "青" },
  { id: "green",  css: "#3fe06a", label: "緑" },
  { id: "red",    css: "#ff4040", label: "赤" },
  { id: "gold",   css: "#ffd23f", label: "金" },
  { id: "rainbow", css: "linear-gradient(45deg,#ff5f5f,#ffd23f,#3fe06a,#3fa7ff,#c95fff)", label: "虹" },
];

/* 保留オーブ画像（黒背景の発光画像 → screen合成で表示）
 * 白・金は既存画像のCSSフィルタで色替え */
const HOLD_IMGS = {
  white:   { src: "imagin/hold_blue.png", filter: "grayscale(1) brightness(1.7)" },
  blue:    { src: "imagin/hold_blue.png", filter: "" },
  green:   { src: "imagin/hold_green.png", filter: "" },
  red:     { src: "imagin/hold_red.png", filter: "" },
  gold:    { src: "imagin/hold_red.png", filter: "hue-rotate(48deg) saturate(1.4) brightness(1.3)" },
  rainbow: { src: "imagin/hold_rainbow.png", filter: "" },
};

/* ---------- 変動パターン抽選 ----------
 * 当落を先に決めた上で演出パターンを選ぶ */
function pickPattern(isWin, isRushMode) {
  const r = Math.random();
  if (isWin) {
    if (r < 0.04) return { type: "zenkaiten" };                 // 全回転（プレミア）
    if (r < 0.34) return { type: "spsp", sp: pickSP() };        // SP→SPSP発展
    if (r < 0.90) return { type: "sp", sp: pickSP() };          // SPリーチ
    return { type: "normal-reach" };                            // ノーマルで当たる
  }
  // ハズレ
  if (isRushMode) {
    // RUSH中は高速変動主体
    if (r < 0.90) return { type: "quick" };
    if (r < 0.965) return { type: "normal-reach" };
    if (r < 0.995) return { type: "sp", sp: pickSP() };
    return { type: "spsp", sp: pickSP() };
  }
  if (r < 0.70) return { type: "quick" };
  if (r < 0.85) return { type: "yokoku" };                      // 予告のみ
  if (r < 0.955) return { type: "normal-reach" };
  if (r < 0.995) return { type: "sp", sp: pickSP() };
  return { type: "spsp", sp: pickSP() };
}

function pickSP() {
  return SP_REACHES[Math.floor(Math.random() * SP_REACHES.length)];
}

/* 保留色抽選（期待度連動） */
function pickHoldColor(isWin, pattern) {
  const r = Math.random();
  if (isWin) {
    if (pattern.type === "zenkaiten" && r < 0.5) return 5;      // 虹
    if (r < 0.10) return 5;
    if (r < 0.35) return 4;
    if (r < 0.65) return 3;
    if (r < 0.85) return 2;
    return 1;
  }
  if (pattern.type === "spsp") { if (r < 0.25) return 3; if (r < 0.6) return 2; return 1; }
  if (pattern.type === "sp")   { if (r < 0.05) return 3; if (r < 0.25) return 2; if (r < 0.55) return 1; return 0; }
  if (pattern.type === "normal-reach") { if (r < 0.08) return 1; return 0; }
  return 0;
}

function charByKey(key) { return CHARACTERS.find(c => c.key === key); }
