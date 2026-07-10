/* =========================================================
 * オーディオ管理（BGM / SE）
 * ======================================================= */
const AudioMgr = (() => {
  const BGM_PATHS = {
    // BGM: 魔王魂
    normal:  "assets/bgm/maou_normal_acoustic53.mp3",
    reach:   "assets/bgm/maou_reach_neorock83.mp3",
    jackpot: "assets/bgm/maou_jackpot_neorock81.mp3",
    rush:    "assets/bgm/常総の帰り道.mp3",   // RUSH中は歌もの＋歌詞テロップ
    // 常総学院シミュレーターより
    nostalgia: "assets/bgm/日常_のどか.mp3",
    comedy:  "assets/bgm/日常_コメディ.mp3",
    hot:     "assets/bgm/日常_白熱.mp3",
    sad:     "assets/bgm/悲しみ.mp3",
    creepy:  "assets/bgm/不気味.mp3",
  };
  const HANRAN_SE = "assets/se/氾濫.mp3";
  const clip = (start, end) => ({ src: HANRAN_SE, start, end });
  // SE: Adobe Firefly生成の個別WAV。確定・告知音（kyuin3）だけは氾濫.mp3の切り出しを残す
  const SE_PATHS = {
    stop:    "assets/se/リール停止音（stop）.wav",
    hold:    "assets/se/入賞音（hold） — チャリン系.wav",
    reach:   "assets/se/リーチ成立（reach）.wav",
    pseudo:  "assets/se/擬似連・発展（pseudo）.wav",
    kyuin3:  clip(5.45, 6.28),       // 確定・告知音（氾濫.mp3から）
    kira:    "assets/se/キラ演出（kira）.wav",
    kira2:   "assets/se/保留変化（kira2）.wav",
    flash:   "assets/se/フラッシュ（flash）.wav",
    levelup: "assets/se/格上げ（levelup）.wav",
    chime:   "assets/se/チャイム（chime） — RUSH終了用.wav",
    drumroll: "assets/se/ドラムロール（drumroll）.wav",
    button:  "assets/se/PUSHボタン（button）.wav",
    bingo:   "assets/se/抽選結果（bingo）.wav",
    hit:     "assets/se/大当り（hit）.wav",
    fanfare: "assets/se/ファンファーレ（fanfare）.wav",
    fail:    "assets/se/失敗・転落（fail）.wav",
    lose:    "assets/se/ハズレ（lose）.wav",
    group:   "assets/se/群予告（group）.wav",
    tsuishi: "assets/se/追試（擬似連スプラッシュ用に新規）.wav",
    wara:    "assets/se/先生バトル敗北（わら！用に新規）.wav",
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
  let audioCtx = null;
  const bufferCache = {};

  function getAudioCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function loadBuffer(src) {
    if (!bufferCache[src]) {
      bufferCache[src] = fetch(src)
        .then(res => res.arrayBuffer())
        .then(data => getAudioCtx().decodeAudioData(data));
    }
    return bufferCache[src];
  }

  function warmSeSprites() {
    // 全SEを一度だけデコードしてWeb Audioバッファに載せる（初回再生の遅延防止）
    loadBuffer(HANRAN_SE).catch(() => {});
    for (const def of Object.values(SE_PATHS)) {
      if (typeof def === "string") loadBuffer(def).catch(() => {});
    }
  }

  // SEはデコード済みバッファから切り出して再生する。
  // （SEごとに<audio>要素を生成するとブラウザの同時メディア数制限に
  //   達したときにループ中のBGM要素が止められることがある）
  // Web Audioが使えない環境（file://直開きでfetch不可・デコード失敗・
  // コンテキスト停止など）では<audio>要素のフォールバックで必ず鳴らす
  let clipFallback = location.protocol === "file:";

  function playClipElement(def, volume) {
    if (!seCache._sprite) { seCache._sprite = new Audio(def.src); seCache._sprite.preload = "auto"; }
    const a = seCache._sprite.cloneNode();
    a.volume = volume;
    const durMs = Math.max(30, (def.end - def.start) * 1000);
    const begin = () => {
      try { a.currentTime = def.start; } catch (e) {}
      a.play().catch(() => {});
      setTimeout(() => { a.pause(); }, durMs);
    };
    if (a.readyState >= 1) begin();
    else { a.addEventListener("loadedmetadata", begin, { once: true }); a.load(); }
  }

  function playClip(def, volume) {
    if (clipFallback) { playClipElement(def, volume); return; }
    const ctx = getAudioCtx();
    // コンテキストが停止中だとバッファ再生は「無音で成功」する。
    // その間は<audio>方式で確実に鳴らす（resumeは getAudioCtx が試みている）
    if (ctx.state !== "running") { playClipElement(def, volume); return; }
    loadBuffer(def.src).then(buf => {
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      node.connect(gain).connect(ctx.destination);
      node.onended = () => { try { node.disconnect(); gain.disconnect(); } catch (e) {} };
      node.start(0, def.start, Math.max(0.01, def.end - def.start));
    }).catch(() => {
      // 以後は<audio>方式に切り替えてSEを鳴らし続ける
      console.warn("SE: Web Audio再生に失敗したため<audio>フォールバックへ切替");
      clipFallback = true;
      playClipElement(def, volume);
    });
  }

  function playBgm(key, volume = 0.35) {
    if (currentBgmKey === key) return;
    stopBgm();
    if (!enabled) { currentBgmKey = key; return; }
    warmSeSprites();
    const a = new Audio(BGM_PATHS[key]);
    a.loop = true;
    a.volume = Math.min(1, volume);
    // 再生に失敗したらキーを捨て、次のplayBgm呼び出しで再試行できるようにする
    // （キーが残ると同キー早期returnでBGMが止まったままになる）
    a.play().catch(() => { if (currentBgm === a) { currentBgm = null; currentBgmKey = null; } });
    currentBgm = a;
    currentBgmKey = key;
  }

  function stopBgm() {
    if (currentBgm) { currentBgm.pause(); currentBgm = null; }
    currentBgmKey = null;
  }

  // 歌詞など、BGMに同期する演出向けの再生位置。
  // BGMが切り替わっている間は null を返し、誤った曲へ同期させない。
  function bgmTime(key) {
    if (!currentBgm || (key && currentBgmKey !== key)) return null;
    return Number.isFinite(currentBgm.currentTime) ? currentBgm.currentTime : null;
  }

  /* ユーザー操作のタイミングでAudioContextを確実に起こす（SE無音対策） */
  function unlock() {
    try { getAudioCtx(); } catch (e) {}
  }

  /* 個別ファイルSE：Web Audioバッファで再生（<audio>フォールバック付き） */
  function playFileElement(src, volume) {
    if (!seCache[src]) { seCache[src] = new Audio(src); seCache[src].preload = "auto"; }
    const a = seCache[src].cloneNode();
    a.volume = volume;
    a.play().catch(() => {});
  }

  function playFile(src, volume) {
    if (clipFallback) { playFileElement(src, volume); return; }
    const ctx = getAudioCtx();
    if (ctx.state !== "running") { playFileElement(src, volume); return; }
    loadBuffer(src).then(buf => {
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      node.connect(gain).connect(ctx.destination);
      node.onended = () => { try { node.disconnect(); gain.disconnect(); } catch (e) {} };
      node.start(0);
    }).catch(() => {
      console.warn("SE: Web Audio再生に失敗したため<audio>フォールバックへ切替");
      clipFallback = true;
      playFileElement(src, volume);
    });
  }

  function se(key, volume = 0.5) {
    if (!enabled) return;
    const def = SE_PATHS[key];
    if (!def) return;
    if (typeof def === "object") playClip(def, volume);
    else playFile(def, volume);
  }

  function voice(key, volume = 0.75) {
    return;
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled) {
      const key = currentBgmKey;
      stopBgm();
      currentBgmKey = key;   // 再開用にキーだけ保持
    } else if (currentBgmKey) {
      const key = currentBgmKey;
      currentBgmKey = null;
      playBgm(key);
    }
    return enabled;
  }

  return { playBgm, stopBgm, bgmTime, se, voice, toggle, unlock, get enabled() { return enabled; } };
})();
