/* =========================================================
 * 液晶演出（リール・リーチ・カットイン・大当り画面）
 * ======================================================= */
const Screen = (() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  const reels = [ $("reel-0"), $("reel-1"), $("reel-2") ];
  const spinTimers = [null, null, null];
  const current = [0, 2, 4]; // CHARACTERS のインデックス

  /* ---------- 基本表示 ---------- */
  function setBg(url, dark = false) {
    const bg = $("lcd-bg");
    bg.style.backgroundImage = `url("${encodeURI(url)}")`;
    bg.style.filter = dark ? "brightness(0.45)" : "brightness(0.85)";
  }

  function setSymbol(i, charIdx) {
    current[i] = charIdx;
    const c = CHARACTERS[charIdx];
    const sym = reels[i].querySelector(".symbol");
    sym.querySelector("img").src = c.img;
    sym.querySelector(".num").textContent = c.num;
    sym.classList.toggle("odd", c.num % 2 === 1);
  }

  function startReel(i, speed = 55) {
    stopReelTimer(i);
    reels[i].classList.add("spinning");
    spinTimers[i] = setInterval(() => {
      setSymbol(i, (current[i] + 1) % CHARACTERS.length);
    }, speed);
  }

  function stopReelTimer(i) {
    if (spinTimers[i]) { clearInterval(spinTimers[i]); spinTimers[i] = null; }
  }

  async function stopReel(i, charIdx, se = true) {
    stopReelTimer(i);
    setSymbol(i, charIdx);
    reels[i].classList.remove("spinning");
    reels[i].classList.add("bounce");
    if (se) AudioMgr.se("stop", 0.4);
    setTimeout(() => reels[i].classList.remove("bounce"), 300);
  }

  function startAll() { for (let i = 0; i < 3; i++) startReel(i); }

  function reelsVisible(v) { $("reels").style.opacity = v ? "1" : "0"; }

  /* ミニ図柄（リーチ中に隅で回す表示） */
  function miniDigits(show, text = "") {
    const el = $("mini-digits");
    el.classList.toggle("hidden", !show);
    if (text) el.textContent = text;
  }

  /* ---------- 汎用エフェクト ---------- */
  function flash(color = "#fff", ms = 350) {
    const f = $("lcd-flash");
    f.style.background = color;
    f.classList.add("on");
    setTimeout(() => f.classList.remove("on"), ms);
  }

  async function telop(text, ms = 1600, cls = "") {
    const t = $("telop");
    t.textContent = text;
    t.className = cls; // hidden解除も兼ねる
    await wait(ms);
    t.className = "hidden";
  }

  async function reachTitle(text, ms = 2000, cls = "sp") {
    const t = $("reach-title");
    t.textContent = text;
    t.className = cls;
    await wait(ms);
    t.className = "hidden";
  }

  async function cutin(charKey, text = "", ms = 1800, cls = "") {
    const c = charByKey(charKey);
    const box = $("cutin");
    $("cutin-img").src = c.img;
    $("cutin-text").textContent = text || c.quote;
    box.className = cls;
    AudioMgr.se("reach", 0.45);
    await wait(ms);
    box.className = "hidden";
  }

  /* 群予告（ちびキャラ大行進） */
  async function mobYokoku() {
    AudioMgr.se("group", 0.5);
    glowFlash("blue", 2400);
    const layer = $("mob-layer");
    for (let i = 0; i < 14; i++) {
      const img = document.createElement("img");
      img.src = CHIBI_IMGS[i % 2];
      img.className = "mob";
      img.style.bottom = `${Math.random() * 30}px`;
      img.style.animationDelay = `${i * 0.13}s`;
      img.style.height = `${70 + Math.random() * 40}px`;
      layer.appendChild(img);
    }
    await wait(2600);
    layer.innerHTML = "";
  }

  /* PUSHボタン（押下 or タイムアウトで解決） */
  function pushButton(timeoutMs = 2500) {
    return new Promise(resolve => {
      const btn = $("push-btn");
      AudioMgr.se("drumroll", 0.45);
      btn.classList.remove("hidden");
      let done = false;
      const finish = (pressed) => {
        if (done) return;
        done = true;
        btn.classList.add("hidden");
        btn.onclick = null;
        resolve(pressed);
      };
      btn.onclick = () => { AudioMgr.se("button", 0.6); finish(true); };
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  /* ---------- モード表示 ---------- */
  function modeBanner(text, cls) {
    const b = $("mode-banner");
    if (!text) { b.className = "hidden"; return; }
    b.textContent = text;
    b.className = cls || "";
  }

  function stCount(text) {
    const el = $("st-count");
    if (!text) { el.className = "hidden"; return; }
    el.textContent = text;
    el.className = "";
  }

  function lcdMsg(text, cls = "") {
    const el = $("lcd-msg");
    if (!text) { el.className = "hidden"; return; }
    el.textContent = text;
    el.className = cls;
  }

  /* ---------- 保留表示（発光オーブ画像） ---------- */
  function renderHolds(queue) {
    for (let i = 0; i < 4; i++) {
      const el = $(`hold-${i}`);
      const item = queue[i];
      if (!item) {
        el.className = "hold";
        el.style.filter = "";
        el.removeAttribute("src");
        continue;
      }
      const col = HOLD_COLORS[item.holdColor];
      const im = HOLD_IMGS[col.id];
      el.src = im.src;
      el.style.filter = im.filter;
      el.className = "hold visible" + (col.id === "rainbow" ? " rainbow" : "");
    }
  }

  /* ---------- 大当り画面 ---------- */
  function jackpotShow(title, charKey) {
    const jl = $("jackpot-layer");
    jl.classList.remove("hidden");
    $("jp-title").textContent = title;
    $("jp-round").textContent = "";
    $("jp-balls").textContent = "";
    const c = charByKey(charKey) || CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    $("jp-char").querySelector("img").src = c.img;
  }
  function jackpotRound(text) { $("jp-round").textContent = text; }
  function jackpotBalls(text) { $("jp-balls").textContent = text; }
  function jackpotChar(charKey) {
    const c = charByKey(charKey);
    if (c) $("jp-char").querySelector("img").src = c.img;
  }
  function jackpotHide() { $("jackpot-layer").classList.add("hidden"); }

  /* ---------- 光エフェクト（キラキラ集中線） ---------- */
  let fxTimer = null;
  function fxKira(which, ms = 1500) {
    const el = $("fx-kira");
    if (!which) { el.classList.add("hidden"); return; }
    el.src = FX_IMGS[which] || which;
    el.classList.remove("hidden");
    if (fxTimer) clearTimeout(fxTimer);
    if (ms > 0) fxTimer = setTimeout(() => el.classList.add("hidden"), ms);
  }

  /* ---------- 筐体ランプ（色別点灯差分オーバーレイ） ----------
   * 赤=大当り / 青=リーチ・予告 / 金=激アツ発展・保留変化 / 虹=RUSH・プレミア */
  const GLOW_SRCS = {
    red:     "imagin/glow_red.png",
    blue:    "imagin/glow_blue.png",
    gold:    "imagin/glow_gold.png",
    rainbow: "imagin/glow_rainbow.png",
  };
  let glowPersist = { cls: "", color: "red" };
  let glowFlashTimer = null;

  function applyGlow(cls, color) {
    const g = $("cab-glow");
    if (!g) return;
    if (color && GLOW_SRCS[color]) {
      const src = GLOW_SRCS[color];
      if (!g.src.endsWith(src)) g.src = src;
    }
    g.className = cls || "";
  }

  /* 常時点灯モードの設定（""で消灯） */
  function glow(cls, color = "red") {
    glowPersist = { cls, color };
    if (!glowFlashTimer) applyGlow(cls, color);
  }

  /* 一時的なフラッシュ点灯（終了後は常時モードへ復帰） */
  function glowFlash(color, ms = 1200) {
    if (glowFlashTimer) clearTimeout(glowFlashTimer);
    applyGlow("pulse-fast", color);
    glowFlashTimer = setTimeout(() => {
      glowFlashTimer = null;
      applyGlow(glowPersist.cls, glowPersist.color);
    }, ms);
  }

  return {
    wait, setBg, setSymbol, startReel, stopReel, startAll, reelsVisible,
    miniDigits, flash, telop, reachTitle, cutin, mobYokoku, pushButton,
    modeBanner, stCount, lcdMsg, renderHolds, glow, glowFlash, fxKira,
    jackpotShow, jackpotRound, jackpotBalls, jackpotChar, jackpotHide,
    get current() { return current; },
  };
})();
