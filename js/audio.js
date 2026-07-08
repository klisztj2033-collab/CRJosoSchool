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
  const HANRAN_SE = "assets/se/氾濫.mp3";
  const clip = (start, end) => ({ src: HANRAN_SE, start, end });
  const SE_PATHS = {
    // 氾濫.mp3をパチンコSE集として秒数指定で切り分ける
    stop:    clip(1.92, 2.18),
    hold:    clip(2.48, 2.95),       // 入賞
    reach:   clip(0.08, 1.48),       // リーチ・強予告
    pseudo:  clip(4.03, 5.18),       // 擬似連・SP発展
    kyuin3:  clip(5.45, 6.28),       // 確定音
    kira:    clip(8.03, 9.35),       // キラ演出
    kira2:   clip(9.72, 10.86),      // 保留変化
    flash:   clip(16.82, 17.56),     // フラッシュ
    levelup: clip(19.50, 20.25),     // 格上げ
    chime:   clip(32.10, 35.60),     // モード終了
    drumroll: clip(21.92, 25.80),    // 判定前の溜め
    button:  clip(19.42, 19.70),     // PUSH
    bingo:   clip(25.95, 27.30),     // 抽選結果
    // 常総学院シミュレーターより
    hit:     clip(27.04, 28.58),
    fanfare: clip(0.00, 1.78),
    fail:    clip(18.65, 19.34),
    lose:    clip(30.02, 31.52),
    group:   clip(12.05, 16.75),
    escape:  clip(34.05, 35.60),
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
  let currentBgmSource = null;
  let currentBgmGain = null;
  const seCache = {};
  const activeSe = new Set();
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
    if (!seCache._hanranPreload) {
      seCache._hanranPreload = new Audio(HANRAN_SE);
      seCache._hanranPreload.preload = "auto";
      seCache._hanranPreload.load();
    }
  }

  function playClip(def, volume) {
    const a = new Audio(`${def.src}#t=${def.start},${def.end}`);
    a.preload = "auto";
    a.volume = volume;
    const durationMs = Math.max(10, (def.end - def.start) * 1000);
    let started = false;
    const cleanup = () => activeSe.delete(a);
    const start = () => {
      if (started) return;
      started = true;
      activeSe.add(a);
      try { a.currentTime = def.start; } catch (e) {}
      a.play().then(() => {
        setTimeout(() => {
          a.pause();
          try { a.currentTime = 0; } catch (e) {}
          cleanup();
        }, durationMs);
      }).catch(cleanup);
    };
    a.addEventListener("ended", cleanup, { once: true });
    a.addEventListener("error", cleanup, { once: true });
    if (a.readyState >= 1) start();
    else {
      a.addEventListener("loadedmetadata", start, { once: true });
      a.load();
      setTimeout(start, 160);
    }
  }

  function playBgm(key, volume = 0.35) {
    if (currentBgmKey === key) return;
    stopBgm();
    if (!enabled) { currentBgmKey = key; return; }
    warmSeSprites();
    const a = new Audio(BGM_PATHS[key]);
    a.loop = true;
    if (key === "rush") {
      a.volume = Math.min(1, volume);
      try {
        const ctx = getAudioCtx();
        currentBgmSource = ctx.createMediaElementSource(a);
        currentBgmGain = ctx.createGain();
        currentBgmGain.gain.value = 6;
        currentBgmSource.connect(currentBgmGain).connect(ctx.destination);
      } catch (e) {
        a.volume = 1;
      }
    } else {
      a.volume = volume;
    }
    a.play().catch(() => {});
    currentBgm = a;
    currentBgmKey = key;
  }

  function stopBgm() {
    if (currentBgm) { currentBgm.pause(); currentBgm = null; }
    if (currentBgmSource) { try { currentBgmSource.disconnect(); } catch (e) {} currentBgmSource = null; }
    if (currentBgmGain) { try { currentBgmGain.disconnect(); } catch (e) {} currentBgmGain = null; }
    currentBgmKey = null;
  }

  function se(key, volume = 0.5) {
    if (!enabled) return;
    const def = SE_PATHS[key];
    if (!def) return;
    if (typeof def === "object") {
      playClip(def, volume);
      return;
    }
    // 同時再生できるよう都度クローン
    if (!seCache[key]) { seCache[key] = new Audio(def); seCache[key].preload = "auto"; }
    const a = seCache[key].cloneNode();
    a.volume = volume;
    a.play().catch(() => {});
  }

  function voice(key, volume = 0.75) {
    return;
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
