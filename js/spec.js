/* =========================================================
 * CR常総学院 〜青春御伽769ver.〜  スペック＆データ定義
 * 出玉スペックは「e Re:ゼロから始める異世界生活 season2」準拠
 * （ミドルタイプ・RUSH突入で約3000個獲得のワンセット型）
 * ======================================================= */

const SPEC = {
  // 大当り確率
  NORMAL_PROB: 1 / 199.9,   // 通常時（ヘソ）
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
  { num: 6, key: "yabuki",    name: "矢吹ゆずる", img: "assets/character/矢吹.png",   quote: "……このスマホゲー、あと一手で勝てるんだ" },
  { num: 7, key: "kotan",     name: "小丹雄登",   img: "assets/character/小丹.png",   quote: "それ、宇宙世紀で例えると…" },
  { num: 8, key: "chinone",   name: "ちのね かい", img: "assets/character/ちのね.png", quote: "大森くん！大森君！" },
];

/* 群予告（魚群風・ちび大行進）用のちびキャラ画像 */
const CHIBI_IMGS = Array.from({ length: 11 }, (_, i) =>
  `assets/character/ちびキャラ${String(i + 1).padStart(2, "0")}_t.png`);

/* リール図柄画像（数字＋キャラ＋宝石装飾。番号1〜8に対応） */
const ZUGARA_IMGS = {
  1: "imagin/図柄１_t.png",
  2: "imagin/図柄２_t.png",
  3: "imagin/図柄３_t.png",
  4: "imagin/図柄４_t.png",
  5: "imagin/図柄５_t.png",
  6: "imagin/図柄６_t.png",
  7: "imagin/図柄７_t.png",
  8: "imagin/図柄８_t.png",
};

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

/* ---------- 通常時ステージ（プレート画像＋背景＋BGM） ----------
 * 一定回転で移行。荒川沖駅はチャンスステージ（先読みで強制移行） */
const STAGES = [
  { id: "classroom",  name: "教室",       bg: BGS.classroom, plate: "imagin/教室_t.png",       bgm: "nostalgia" },
  { id: "trainIn",    name: "常磐線車内", bg: BGS.trainIn,   plate: "imagin/常磐線車内_t.png", bgm: "comedy" },
  { id: "library",    name: "図書室",     bg: BGS.library,   plate: "imagin/図書室_t.png",     bgm: "nostalgia" },
  { id: "gym",        name: "体育館",     bg: BGS.gym,       plate: "imagin/体育館_t.png",     bgm: "hot" },
  { id: "tsuchiura",  name: "土浦駅",     bg: BGS.station,   plate: "imagin/土浦駅_t.png",     bgm: "comedy" },
  { id: "arakawaoki", name: "荒川沖駅",   bg: BGS.train,     plate: "imagin/荒川沖駅_t.png",   bgm: "hot", chance: true },
];
const CHANCE_STAGE = 5;               // 荒川沖駅（チャンスステージ）のindex
const STAGE_SPAN = () => 20 + Math.floor(Math.random() * 16);  // 20〜35回転で移行

/* ---------- 擬似連「追試」 ---------- */
const TSUISHI_IMG = "imagin/追試_t.png";
/* 擬似連回数の抽選（通常時のみ）。回数が多いほど期待度UP */
function decideTsuishi(isWin, pattern) {
  if (pattern.type === "zenkaiten" || pattern.type === "quick" || pattern.type === "yokoku") return 0;
  const r = Math.random();
  if (isWin) {
    if (pattern.type === "spsp") return r < 0.35 ? 2 : (r < 0.80 ? 1 : 0);
    return r < 0.40 ? 1 : 0;                       // sp / normal-reach
  }
  if (pattern.type === "spsp") return r < 0.30 ? 1 : 0;
  return r < 0.08 ? 1 : 0;                         // ハズレはたまに1回で終わる
}

/* ---------- RUSH中の先生バトル ----------
 * RUSH中の当落を先生とのバトル形式で見せる（勝利＝大当り継続） */
const TEACHER_BATTLES = [
  {
    id: "takahashi", name: "高橋先生", img: "imagin/高橋先生.png", angry: "imagin/高橋先生_怒り.png",
    title: "VS高橋先生 英単語テスト",
    intro: "抜き打ち英単語テスト！ 80点以下は赤点──！？",
    lines: ["高橋先生「範囲は昨日言った通りです」", "間違えた数だけ課題が増える…！ 思い出せ！！"],
    winLine: "92点！！ 赤点回避──テスト突破！！",
    loseLine: "78点……赤点。放課後は補習……",
  },
  {
    id: "ito", name: "伊藤先生", img: "imagin/伊藤先生.png", angry: "imagin/伊藤先生_怒り.png",
    title: "VS伊藤先生 持ち物検査",
    intro: "抜き打ち持ち物検査！！ 漫画・ゲーム・スマホは没収！！",
    lines: ["伊藤先生「カバンを開けなさい」", "頼む…何も出てくるな…！！"],
    winLine: "出てきたのはライトノベル──なぜかセーフ！！",
    loseLine: "スマホ発見……没収……",
  },
  {
    id: "sugaya", name: "菅谷先生", img: "imagin/菅谷先生.png", angry: "imagin/菅谷先生_怒り.png",
    title: "VS菅谷先生 授業態度チェック",
    intro: "菅谷先生が教室を見回っている……",
    lines: ["（目を合わせるな…真面目に板書しろ…）", "菅谷先生「─────」"],
    winLine: "見回り通過！！ 課題回避──！！",
    loseLine: "「わら！」……わら半紙の課題が課された……",
  },
];
function pickTeacherBattle() {
  return TEACHER_BATTLES[Math.floor(Math.random() * TEACHER_BATTLES.length)];
}

/* ---------- RUSH楽曲「常総の帰り道」歌詞 ----------
 * 実音源を解析したフレーズ開始秒。固定間隔ではなくBGMのcurrentTimeへ同期する。 */
const KAERIMICHI_LYRICS = [
  { at:   0.0, text: "英単語テストは 間違えた数だけ" },
  { at:  14.0, text: "全体責任で 課題が増えたね" },
  { at:  19.6, text: "体育祭の点数 どこか不自然で" },
  { at:  26.8, text: "笑うしかなくて それでも走った" },
  { at:  33.5, text: "頭のおかしい パソコンサークル" },
  { at:  39.9, text: "画面の向こうで 夜まで騒いだ" },
  { at:  46.0, text: "女子棟に忍び込んだ 学習合宿の夜" },
  { at:  53.5, text: "泥棒だって 大騒ぎになって" },
  { at:  63.0, text: "あの日の常総学院 全部、今は愛しい" },
  { at:  68.6, text: "ふざけた傷も まじめな涙も" },
  { at:  73.7, text: "ぜんぶ僕らの証" },
  { at:  77.0, text: "あの日の常総学院 名前を呼ぶたびに" },
  { at:  83.4, text: "胸の奥で まだ光るんだ" },
  { at:  88.5, text: "帰りたくなるんだ" },
  { at:  93.0, text: "教室の窓ガラス ふざけて割った日の" },
  { at: 102.1, text: "静かな顔のまま 謝ったよね" },
  { at: 109.5, text: "全校集会では 生徒会長がずっと" },
  { at: 117.7, text: "愛を語り続けて 授業は短縮" },
  { at: 124.0, text: "テスト中の寝っ屁で みんな肩を震わせ" },
  { at: 134.8, text: "怒られたあとにも 笑いが残った" },
  { at: 142.5, text: "同性同士の告白 いくつも生まれて" },
  { at: 145.0, text: "ぎこちない廊下に 春が混ざってた" },
  { at: 153.0, text: "あの日の常総学院 全部、今は愛しい" },
  { at: 157.7, text: "ふざけた傷も まじめな涙も" },
  { at: 162.1, text: "ぜんぶ僕らの証" },
  { at: 166.0, text: "あの日の常総学院 名前を呼ぶたびに" },
  { at: 172.4, text: "胸の奥で まだ光るんだ" },
  { at: 177.3, text: "帰りたくなるんだ" },
  { at: 182.5, text: "彼女の耳を借りて イヤホンの耳カスを" },
  { at: 188.8, text: "こっそり掃除した そんな日もあった" },
  { at: 195.0, text: "先生の言ってた トライって結局" },
  { at: 200.4, text: "何だったんだろう 今も少し迷う" },
  { at: 209.5, text: "それでも進むたび 思い出すのは" },
  { at: 215.7, text: "模造紙の山と 夜の図書館" },
  { at: 222.0, text: "持ち物検査の前 情報戦みたいに" },
  { at: 228.5, text: "みんなで隠してた 笑い声まで" },
  { at: 239.0, text: "あの日の常総学院 頭ごなしの朝も" },
  { at: 245.8, text: "熱かった夜も ぜんぶ僕らの証" },
  { at: 251.5, text: "あの日の常総学院 同じ髪型の列" },
  { at: 258.5, text: "まぶしいほど ひとつだった" },
  { at: 265.1, text: "もう戻れないけど" },
  { at: 268.5, text: "あの日の常総学院 名前を呼ぶたびに" },
  { at: 275.4, text: "胸の奥で まだ光るんだ" },
  { at: 280.3, text: "帰りたくなるんだ" },
  { at: 284.5, text: "" },
];

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
  vs3d:      "movie/VS３D文字アニメーション.mp4",         // 生徒会長決戦VS
};

/* SPSP専用のイベント1枚絵 */
const SPSP_EVENT_IMGS = {
  gibaPc: "imagin/ギバ先生_パソコン室.png",
};

/* ---------- SPリーチ定義 ----------
 * winRate は「当たり変動のうちこのリーチが選ばれた際の表示強度」の目安 */
const SP_REACHES = [
  {
    id: "kouron", title: "口論バトル 石川 VS 西山", bg: "imagin/口論バトル 石川VS西山.png",
    chars: ["ishikawa", "nishiyama"], grade: "strong", pan: true,   // 左(石川)→右(西山)へカメラパン
    lines: [
      "帰りの常磐線。今日もこの二人の言い争いが始まった。",
      "石川「は？ 論理的に考えて俺が正しいんだが」",
      "西山「石川、それ昨日と言ってること逆だぞ」",
      "ヒートアップする口論、軍配はどちらに──！？",
    ],
  },
  {
    id: "test", title: "定期テスト 最後の一問", bg: BGS.classroom,
    chars: ["kotan"], grade: "mid",
    lines: [
      "定期テスト最終科目。学年一位をかけた勝負の一問。",
      "小丹「この問題……見たことのあるパターンだ」",
      "残り時間わずか。最後の解答を埋めきれるか──！？",
    ],
  },
  {
    id: "dash", title: "遅刻ギリギリ 通学ダッシュ", bg: "imagin/常磐線 遅延ダッシュ.png",
    chars: ["yabuki"], grade: "mid",
    lines: [
      "人身事故で常磐線がストップ。始業まであと少し。",
      "矢吹「……ここからなら、走った方が早いか」",
      "土浦駅から学校まで全力疾走！ 始業に間に合うか──！？",
    ],
  },
  {
    id: "taiiku", title: "体育祭 クラス対抗リレー", bg: "imagin/体育祭 大声援リレー.png",
    chars: ["kuno"], grade: "strong",
    lines: [
      "体育祭、クラス対抗リレー。アンカーはこの男。",
      "久野「うおおおおい！！ 絶対に勝つぞ！！」",
      "大声援を背に最終走者が疾走！ 一位でゴールなるか──！？",
    ],
  },
  {
    id: "letter", title: "ラブレター大作戦 ちのね", bg: "imagin/ちのね_ラブレター.png",
    chars: ["chinone"], grade: "strong",
    lines: [
      "ちのねが下駄箱にそっと忍ばせた、一通の手紙。",
      "ちのね「大森くんに……気持ち、伝わるかな……」",
      "放課後、勇気をふりしぼって呼び止める。想いは届くか──！？",
    ],
  },
  {
    id: "nico", title: "パソコン室 秘密の動画鑑賞", bg: BGS.pc,
    chars: ["kojima"], grade: "mid",
    lines: [
      "放課後のパソコン室。こっそり動画を楽しむ秘密の集会。",
      "小島「これ、ニコニコで話題の神実況なんだよ」",
      "廊下に足音が……！ 先生に見つかる前に画面を消せるか──！？",
    ],
    spsp: {
      title: "緊急SPSP ギバ先生 パソコン室巡回",
      bg: SPSP_EVENT_IMGS.gibaPc,
      lines: [
        "ドアが開いた。ギバ先生がパソコン室へ入ってきた！",
        "閲覧履歴を消して全員退室できれば突破──！？",
      ],
    },
  },
];

/* SPSPリーチ（発展・最終決戦） */
const SPSP_REACH = {
  id: "seitokai", title: "生徒会長決戦 小丹 VS 伊藤輝明", bg: BGS.school,
  chars: ["kotan"], grade: "max",
  lines: [
    "生徒会長選挙、最終演説。候補は小丹と伊藤輝明。",
    "全校生徒が見守る中、二人の主張が校舎前にぶつかる。",
    "常総学院の次期会長を決める、最後の一票の行方は──！？",
  ],
};

/* 激熱確定背景（出現＝大当り確定のプレミア背景） */
const CONFIRM_BG = "imagin/激熱確定背景_ちのね.png";

/* 大当り確定演出用の各キャラ全身画像（大当り画面で大きく背景のように表示） */
const CONFIRM_CHAR_IMGS = {
  kuno:      "imagin/久野_大当り確定演出用_t.png",
  akagami:   "imagin/赤上_大当り確定演出用_t.png",
  ishikawa:  "imagin/石川_大当り確定演出用_t.png",
  nishiyama: "imagin/西山_大当り確定演出用_t.png",
  kotan:     "imagin/小丹_大当り確定演出用_t.png.fixed.png",
  chinone:   "imagin/ちのね_大当り確定演出用_t.png",
  yabuki:    "imagin/矢吹_大当り確定演出用_t.png",
  kojima:    "imagin/小島_大当り確定演出用_t.png",
};

/* チャレンジ突破後、2セット目のボーナスで使う一枚絵 */
const BONUS_CHAR_IMGS = {
  kuno:      "imagin/久野02_大当たり確定演出.png",
  ishikawa:  "imagin/石川02_大当り確定演出用.png",
  nishiyama: "imagin/西山02_大当り確定演出用.png",
  kotan:     "imagin/小丹02_大当り確定演出用.png",
  yabuki:    "imagin/矢吹02_大当り確定演出用.png",
  kojima:    "imagin/小島02_大当り確定演出用.png",
};

/* 先生バトル突破時の確定カット */
const TEACHER_CONFIRM_IMGS = {
  ito: "imagin/伊藤先生_大当り確定演出用.png",
};

/* 大当り開始時に1%で出現するプレミア一枚絵 */
const PREMIUM_CONFIRM_IMG = "imagin/少女_大当り確定演出用_表示確率1%.png";

/* 文字系画像（演出中に大きくオーバーレイ表示） */
const TEXT_IMGS = {
  reach:       "imagin/リーチ文字.png",
  migiuchi:    "imagin/右打ち文字.png",
};

/* 生徒会長決戦（SPSP）用の選挙1枚絵 */
const SPSP_IMGS = {
  kotan: "imagin/小丹_選挙.png",
  ito:   "imagin/伊藤輝明_選挙.png",
};

/* RUSH演出用の画像（ロゴ・宝石数字・バツ） */
const RUSH_LOGO = "imagin/常総RUSH_t.png";
const BATSU_IMG = "imagin/×_t.png";
const RUSH_NUM_IMGS = {
  0: "imagin/(0)_t.png",
  1: "imagin/(1)_t.png", 2: "imagin/(2)_t.png", 3: "imagin/(3)_t.png",
  4: "imagin/(4)_t.png", 5: "imagin/(5)_t.png", 6: "imagin/(6)_t.png",
  7: "imagin/(7)_t.png", 8: "imagin/(8)_t.png", 9: "imagin/(9)_t.png",
};

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
