/* =========================================================
 * オーディオ管理（BGM / SE）
 * ======================================================= */
const AudioMgr = (() => {
  const BGM_PATHS = {
    // BGM: 魔王魂
    normal:  "assets/bgm/maou_normal_acoustic53.mp3",
    reach:   "assets/bgm/maou_reach_neorock83.mp3",
    jackpot: "assets/bgm/maou_jackpot_neorock81.mp3",
    rush:    "assets/bgm/RUSH時BGM.mp3",
    // 常総学院シミュレーターより
    nostalgia: "assets/bgm/日常_のどか.mp3",
    sad:     "assets/bgm/悲しみ.mp3",
    creepy:  "assets/bgm/不気味.mp3",
  };
  const SE_PATHS = {
    // 効果音ラボ
    stop:    "assets/se/決定ボタンを押す1.mp3",
    hold:    "assets/se/nyusho_coin.mp3",       // 入賞チャリン
    reach:   "assets/se/kyuin1.mp3",            // キュイン（シャキーン）
    pseudo:  "assets/se/kyuin2.mp3",            // キュイン2
    kyuin3:  "assets/se/kyuin3.mp3",            // キュピーン（OtoLogic）
    kira:    "assets/se/kira1.mp3",             // キラーン
    kira2:   "assets/se/kira2.mp3",             // 保留変化
    flash:   "assets/se/flash1.mp3",            // 光る
    levelup: "assets/se/levelup1.mp3",          // 格上げ
    chime:   "assets/se/school-chime1.mp3",     // 学校チャイム
    drumroll: "assets/se/drum-roll1.mp3",       // ドラムロール
    button:  "assets/se/push_btn.mp3",          // PUSHボタン
    bingo:   "assets/se/bingo_result.mp3",      // 抽選結果（OtoLogic）
    // 常総学院シミュレーターより
    hit:     "assets/se/金属バットで打つ1.mp3",
    fanfare: "assets/se/combo_triple.mp3",
    fail:    "assets/se/ショック1.mp3",
    lose:    "assets/se/間抜け1.mp3",
    group:   "assets/se/電車通過3.mp3",
    escape:  "assets/se/ピューンと逃げる.mp3",
  };
  // キャラボイス: VOICEVOX（ずんだもん）
  const VOICE_PATHS = {
    reach:   "assets/voice/voice_reach.mp3",
    atsui:   "assets/voice/voice_atsui.mp3",
    jackpot: "assets/voice/voice_jackpot.mp3",
    rush:    "assets/voice/voice_rush.mp3",
  };

  let enabled = true;
  let currentBgm = null;
  let currentBgmKey = null;
  const seCache = {};

  function playBgm(key, volume = 0.35) {
    if (currentBgmKey === key) return;
    stopBgm();
    if (!enabled) { currentBgmKey = key; return; }
    const a = new Audio(BGM_PATHS[key]);
    a.loop = true;
    a.volume = volume;
    a.play().catch(() => {});
    currentBgm = a;
    currentBgmKey = key;
  }

  function stopBgm() {
    if (currentBgm) { currentBgm.pause(); currentBgm = null; }
    currentBgmKey = null;
  }

  function se(key, volume = 0.5) {
    if (!enabled) return;
    // 同時再生できるよう都度クローン
    if (!seCache[key]) { seCache[key] = new Audio(SE_PATHS[key]); seCache[key].preload = "auto"; }
    const a = seCache[key].cloneNode();
    a.volume = volume;
    a.play().catch(() => {});
  }

  function voice(key, volume = 0.75) {
    if (!enabled || !VOICE_PATHS[key]) return;
    const a = new Audio(VOICE_PATHS[key]);
    a.volume = volume;
    a.play().catch(() => {});
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled) {
      if (currentBgm) { currentBgm.pause(); currentBgm = null; }
    } else if (currentBgmKey) {
      const key = currentBgmKey;
      currentBgmKey = null;
      playBgm(key);
    }
    return enabled;
  }

  return { playBgm, stopBgm, se, voice, toggle, get enabled() { return enabled; } };
})();
