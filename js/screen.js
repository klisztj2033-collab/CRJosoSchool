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
  // fit=true で画像全体を表示（横長の1枚絵の見切れ防止）
  function setBg(url, dark = false, fit = false) {
    const bg = $("lcd-bg");
    bg.style.backgroundImage = `url("${encodeURI(url)}")`;
    bg.style.filter = dark ? "brightness(0.55)" : "brightness(1)";
    bg.style.backgroundSize = fit ? "contain" : "cover";
    bg.classList.toggle("fit", fit);
    // パンの状態をリセット（余白なしのcover表示に戻す）
    bg.style.transition = "none";
    bg.style.backgroundPosition = "center";
  }

  // 背景の表示位置を即時セット（cover表示のままカメラ位置を変える）
  function setBgPos(pos) {
    const bg = $("lcd-bg");
    bg.style.transition = "none";
    bg.style.backgroundPosition = pos;
  }

  // カメラパン：fromPos → toPos へ ms かけて移動（cover表示・余白なし）
  function panBg(fromPos, toPos, ms = 3000) {
    const bg = $("lcd-bg");
    bg.style.transition = "none";
    bg.style.backgroundPosition = fromPos;
    void bg.offsetWidth;   // リフロー
    bg.style.transition = `background-position ${ms}ms ease-in-out`;
    bg.style.backgroundPosition = toPos;
  }

  function setSymbol(i, charIdx) {
    current[i] = charIdx;
    const c = CHARACTERS[charIdx];
    const sym = reels[i].querySelector(".symbol");
    // 図柄画像（数字＋キャラ入り）。用意が無ければキャラ立ち絵にフォールバック
    sym.querySelector("img").src = (ZUGARA_IMGS && ZUGARA_IMGS[c.num]) || c.img;
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

  // opts: 旧来は boolean(se)。{se, decel} も可。
  async function stopReel(i, charIdx, opts) {
    let se = true, decel = false;
    if (typeof opts === "boolean") se = opts;
    else if (opts) { se = opts.se !== false; decel = !!opts.decel; }
    stopReelTimer(i);
    reels[i].classList.remove("spinning");
    if (decel) {
      // 減速しながら数コマ送る（「止まるかな？」の間）
      reels[i].classList.add("slowing");
      const steps = [70, 100, 135, 180, 235];
      for (const dur of steps) {
        setSymbol(i, (current[i] + 1) % CHARACTERS.length);
        if (se) AudioMgr.se("stop", 0.18);
        await wait(dur);
      }
      reels[i].classList.remove("slowing");
    }
    setSymbol(i, charIdx);
    reels[i].classList.add("bounce");
    if (se) AudioMgr.se("stop", 0.4);
    setTimeout(() => reels[i].classList.remove("bounce"), 340);
  }

  function startAll() {
    // 変動開始時は必ずリールを表示に戻す
    // （RUSH当落演出などで reelsVisible(false) のまま残る事故を防ぐ）
    $("reels").style.opacity = "1";
    AudioMgr.se("reelSpin", 0.11);
    for (let i = 0; i < 3; i++) {
      reels[i].classList.remove("tenpai", "win");
      startReel(i);
    }
  }

  function reelsVisible(v) { $("reels").style.opacity = v ? "1" : "0"; }

  // SP中もテンパイ図柄を見失わないよう、液晶下部へ縮小して残す。
  // 戻り値は切替前の状態（確定演出の一時切替で使用）。
  function reelsEventMode(on) {
    const el = $("reels");
    const wasOn = el.classList.contains("event-mode");
    el.classList.toggle("event-mode", on);
    el.style.opacity = "1";
    return wasOn;
  }

  /* テンパイ／当り確定の決めポーズ */
  function tenpaiPose(on) {
    reels[0].classList.toggle("tenpai", on);
    reels[2].classList.toggle("tenpai", on);
  }
  function winPose() {
    for (let i = 0; i < 3; i++) {
      reels[i].classList.remove("tenpai");
      reels[i].classList.add("win");
    }
  }
  function clearPose() {
    for (let i = 0; i < 3; i++) reels[i].classList.remove("tenpai", "win");
  }

  /* 回転数表示（右上） */
  function spinDisplay(n) {
    const el = $("spin-num");
    if (el) el.textContent = n;
  }

  /* 激熱確定背景（プレミア・出現＝当り確定） */
  function confirmBg(show) {
    const el = $("confirm-bg");
    if (!el) return;
    if (!show) { el.classList.add("hidden"); return; }
    if (!el.src.endsWith(encodeURI(CONFIRM_BG))) el.src = CONFIRM_BG;
    el.classList.remove("hidden");
  }

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

  /* 群予告（ちびキャラ大行進＝魚群演出） */
  async function mobYokoku() {
    AudioMgr.se("group", 0.5);
    glowFlash("blue", 2400);
    const layer = $("mob-layer");
    // 全ちびキャラをシャッフルして2周分流す（同じ顔が続かない魚群）
    const order = [...CHIBI_IMGS, ...CHIBI_IMGS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < order.length; i++) {
      const img = document.createElement("img");
      img.src = order[i];
      img.className = "mob";
      img.style.bottom = `${Math.random() * 34}px`;
      img.style.animationDelay = `${i * 0.11}s`;
      img.style.height = `${64 + Math.random() * 46}px`;
      layer.appendChild(img);
    }
    await wait(2900);
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

  /* 数字を宝石数字画像の桁列HTMLに変換 */
  function digitHtml(num, cls) {
    return String(num).split("").map(d => {
      const src = RUSH_NUM_IMGS[d];
      return src
        ? `<img class="${cls}" src="${encodeURI(src)}" alt="${d}">`
        : `<span class="jd-zero">${d}</span>`;
    }).join("");
  }

  /* RUSH情報パネル（常総RUSH×連チャン数／獲得玉数／残り回数） */
  function rushInfo(show, renchan, gainBalls, remain) {
    const panel = $("rush-info");
    if (!show) { panel.classList.add("hidden"); return; }
    $("rush-renchan").innerHTML =
      `<img class="rush-logo-sm" src="${encodeURI(RUSH_LOGO)}" alt="常総RUSH">` +
      `<img class="jd-x" src="${encodeURI(BATSU_IMG)}" alt="×">` +
      digitHtml(Math.max(1, renchan || 1), "jd");
    $("rush-gain").innerHTML =
      `<span class="rg-label">獲得</span>` + digitHtml(gainBalls || 0, "jd") + `<span class="rg-label">玉</span>`;
    $("rush-remain").innerHTML = remain == null
      ? ""
      : `<span class="rg-label" style="font-size:11px">残り ${remain}回</span>`;
    panel.classList.remove("hidden");
  }

  /* 大きな画像スプラッシュ（RUSH突入ロゴ・×など。keyは"logo"|"batsu"|パス） */
  let splashTimer = null;
  function rushSplash(key, ms = 1800) {
    const el = $("rush-splash");
    if (!key) { el.classList.add("hidden"); el.classList.remove("show"); return; }
    const src = key === "logo" ? RUSH_LOGO : key === "batsu" ? BATSU_IMG : key;
    el.src = src;
    el.classList.remove("hidden");
    el.classList.add("show");
    void el.offsetWidth;
    if (splashTimer) clearTimeout(splashTimer);
    if (ms > 0) splashTimer = setTimeout(() => { el.classList.add("hidden"); el.classList.remove("show"); }, ms);
  }

  function lcdMsg(text, cls = "") {
    const el = $("lcd-msg");
    if (!text) { el.className = "hidden"; return; }
    el.textContent = text;
    el.className = cls;
  }

  /* ステージ名プレート（移行時に短く表示） */
  let stagePlateTimer = null;
  function stagePlate(src, ms = 1600) {
    const el = $("stage-plate");
    if (!el) return;
    if (!src) { el.classList.add("hidden"); el.classList.remove("show"); return; }
    el.src = encodeURI(src);
    el.classList.remove("hidden");
    el.classList.add("show");
    void el.offsetWidth;
    if (stagePlateTimer) clearTimeout(stagePlateTimer);
    if (ms > 0) stagePlateTimer = setTimeout(() => { el.classList.add("hidden"); el.classList.remove("show"); }, ms);
  }

  /* 歌詞テロップ（RUSH楽曲用のカラオケ風ティッカー） */
  let lyricsTimer = null;
  let lyricsIdx = -1;
  function lyricsStart(cues, timeSource) {
    const el = $("lyrics");
    if (!el || !cues || !cues.length) return;
    lyricsStop();
    lyricsIdx = -1;
    const update = () => {
      const t = typeof timeSource === "function" ? timeSource() : null;
      if (t == null) return;
      let next = -1;
      for (let i = 0; i < cues.length && cues[i].at <= t; i++) next = i;
      if (next === lyricsIdx) return;
      lyricsIdx = next;
      const text = next >= 0 ? cues[next].text : "";
      el.textContent = text;
      el.classList.toggle("hidden", !text);
    };
    update();
    // Audio要素の現在時刻を基準にするため、停止・再開や処理落ちでもずれない。
    lyricsTimer = setInterval(update, 100);
  }
  function lyricsStop() {
    const el = $("lyrics");
    if (el) el.classList.add("hidden");
    if (lyricsTimer) { clearInterval(lyricsTimer); lyricsTimer = null; }
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
  function jackpotArt(charKey, opts = {}) {
    let bonusSrc = opts.bonus && BONUS_CHAR_IMGS && BONUS_CHAR_IMGS[charKey];
    // チャレンジ後のボーナスではチャレンジ前の確定演出画像を出さない：
    // 専用絵が無いキャラは専用絵を持つキャラの絵で代用する
    if (opts.bonus && !bonusSrc && BONUS_CHAR_IMGS) {
      const keys = Object.keys(BONUS_CHAR_IMGS);
      if (keys.length) bonusSrc = BONUS_CHAR_IMGS[keys[charKey.length % keys.length]];
    }
    const src = opts.src || bonusSrc ||
      (CONFIRM_CHAR_IMGS && CONFIRM_CHAR_IMGS[charKey]) ||
      (charByKey(charKey) || CHARACTERS[0]).img;
    return { src, scene: !!opts.src || !!bonusSrc };
  }
  function applyJackpotArt(charKey, opts = {}) {
    const art = jackpotArt(charKey, opts);
    const bg = $("jp-charbg");
    bg.src = art.src;
    bg.classList.toggle("bonus-scene", art.scene);
    bg.style.animation = "none";
    void bg.offsetWidth;
    bg.style.animation = "";
  }
  function jackpotShow(title, charKey, opts = {}) {
    const jl = $("jackpot-layer");
    jl.classList.remove("hidden");
    $("jp-title").textContent = "";
    $("jp-round").textContent = "";
    $("jp-balls").textContent = "";
    // 当りキャラ、またはチャレンジ突破後の02一枚絵を背景表示
    applyJackpotArt(charKey, opts);
  }
  function jackpotRound(text) { $("jp-round").textContent = text; }
  function jackpotBalls(value, target) {
    const el = $("jp-balls");
    const digits = String(value).replace(/[^\d]/g, "");
    const targetDigits = target == null ? "" : String(target).replace(/[^\d]/g, "");
    if (!digits) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = targetDigits
      ? `${digitHtml(digits, "jp-ball-digit jp-ball-num")}<span class="jp-ball-slash">/</span>${digitHtml(targetDigits, "jp-ball-digit jp-ball-den")}`
      : digitHtml(digits, "jp-ball-digit jp-ball-num");
  }
  function jackpotChar(charKey, opts = {}) {
    applyJackpotArt(charKey, opts);
  }
  function jackpotHide() {
    const jl = $("jackpot-layer");
    jl.classList.add("hidden");
    jl.classList.remove("rush-info-only");
    const bg = $("jp-charbg");
    if (bg) bg.classList.remove("bonus-scene");
  }

  let yakumonoTimer = null;
  function yakumonoDrop(ms = 1100) {
    const cab = $("cab");
    if (!cab) return;
    cab.classList.remove("yakumono-drop");
    void cab.offsetWidth;
    cab.classList.add("yakumono-drop");
    AudioMgr.se("yakumonoDrop", 0.72);
    if (yakumonoTimer) clearTimeout(yakumonoTimer);
    yakumonoTimer = setTimeout(() => cab.classList.remove("yakumono-drop"), ms);
  }

  /* ---------- 演出動画（黒背景素材をscreen合成で重ねる） ---------- */
  const fxVideo = $("fx-video");
  let fxVideoTimer = null;

  function playVideo(key, opts = {}) {
    const src = VIDEO_FX[key];
    if (!fxVideo || !src) return;
    const { front = false, ms = 0, loop = false, opacity = null } = opts;
    fxVideo.onerror = () => stopVideo();   // ファイルが無ければ無視
    fxVideo.onended = () => { if (!loop) stopVideo(); };
    if (fxVideo.dataset.key !== key) {
      fxVideo.src = src;
      fxVideo.dataset.key = key;
    }
    fxVideo.className = front ? "front" : "back";
    fxVideo.style.opacity = (opacity != null) ? opacity : "";  // 指定時はCSSを上書き
    fxVideo.loop = loop;
    fxVideo.muted = true;
    try { fxVideo.currentTime = 0; } catch (e) {}
    const p = fxVideo.play();
    if (p) p.catch(() => stopVideo());
    if (fxVideoTimer) clearTimeout(fxVideoTimer);
    fxVideoTimer = ms > 0 ? setTimeout(stopVideo, ms) : null;
  }

  function stopVideo() {
    if (!fxVideo) return;
    fxVideo.pause();
    fxVideo.className = "hidden";
    fxVideo.style.opacity = "";
    if (fxVideoTimer) { clearTimeout(fxVideoTimer); fxVideoTimer = null; }
  }

  /* ---------- 文字系画像オーバーレイ ---------- */
  let txtImgTimer = null;
  function showTextImg(key, ms = 1400) {
    const el = $("txt-img");
    if (!el || !TEXT_IMGS[key]) return;
    el.src = TEXT_IMGS[key];
    el.classList.remove("hidden");
    el.classList.add("show");
    void el.offsetWidth;   // アニメ再始動
    if (txtImgTimer) clearTimeout(txtImgTimer);
    if (ms > 0) txtImgTimer = setTimeout(() => { el.classList.add("hidden"); el.classList.remove("show"); }, ms);
  }
  function hideTextImg() {
    const el = $("txt-img");
    if (el) { el.classList.add("hidden"); el.classList.remove("show"); }
    if (txtImgTimer) { clearTimeout(txtImgTimer); txtImgTimer = null; }
  }

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
    wait, setBg, setBgPos, panBg, setSymbol, startReel, stopReel, startAll, reelsVisible, reelsEventMode,
    miniDigits, flash, telop, reachTitle, cutin, mobYokoku, pushButton,
    modeBanner, stCount, lcdMsg, renderHolds, glow, glowFlash, fxKira,
    stagePlate, lyricsStart, lyricsStop,
    playVideo, stopVideo, tenpaiPose, winPose, clearPose, spinDisplay, confirmBg,
    showTextImg, hideTextImg, rushInfo, rushSplash, yakumonoDrop,
    jackpotShow, jackpotRound, jackpotBalls, jackpotChar, jackpotHide,
    get current() { return current; },
  };
})();
