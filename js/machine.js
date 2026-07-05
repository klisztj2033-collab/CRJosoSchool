/* =========================================================
 * ゲーム進行（抽選・保留・変動・大当り・モード管理）
 * ======================================================= */
const Machine = (() => {
  const $ = (id) => document.getElementById(id);
  const wait = Screen.wait;

  /* ---------- 状態 ---------- */
  const S = {
    balls: SPEC.START_BALLS,
    mode: "normal",          // normal | rush
    modeLeft: 0,             // RUSH（高確率時短）残り回転数
    holdQueue: [],           // {isWin, pattern, holdColor}
    spinning: false,
    inJackpot: false,
    spins: 0,                // 当り後からの回転数
    totalSpins: 0,
    hits: 0,
    rushHits: 0,
    renchan: 0,
    maxRenchan: 0,
    history: [],             // {type:"rush10"|"jitan4"|...}
  };

  /* ---------- UI更新 ---------- */
  function updateBalls(delta) {
    S.balls += delta;
    $("ball-count").textContent = S.balls.toLocaleString();
    $("ball-count").classList.toggle("minus", S.balls <= 0);
  }

  function updateCounter() {
    $("dc-spins").textContent = S.spins;
    $("dc-total").textContent = S.totalSpins;
    $("dc-hits").textContent = S.hits;
    $("dc-rush").textContent = S.rushHits;
    $("dc-renchan").textContent = S.maxRenchan;
    const h = $("dc-history");
    h.innerHTML = "";
    for (const item of S.history.slice(-20)) {
      const dot = document.createElement("span");
      dot.className = "hdot " + (item.rush ? "rush" : "normal");
      dot.title = item.label;
      h.appendChild(dot);
    }
  }

  function updateModeUI() {
    const migiuchi = S.mode !== "normal" || S.inJackpot;
    $("migiuchi").classList.toggle("hidden", !migiuchi);
    Board.denchuOpen = S.mode !== "normal";

    if (S.mode === "rush") {
      Screen.modeBanner("常総RUSH", "rush");
      Screen.stCount(`残り ${S.modeLeft}回`);
    } else {
      Screen.modeBanner(null);
      Screen.stCount(null);
    }
    if (!S.inJackpot) {
      if (S.mode === "rush") Screen.glow("pulse-slow", "rainbow");
      else Screen.glow("");
    }
  }

  function bgmForMode() {
    if (S.mode === "rush") AudioMgr.playBgm("rush");
    else AudioMgr.playBgm("normal");
  }

  /* ---------- 入賞ハンドラ ---------- */
  function onHeso() {
    updateBalls(SPEC.HESO_PAY);
    enqueueSpin();
  }

  function onDenchu() {
    updateBalls(SPEC.DENCHU_PAY);
    if (S.mode !== "normal") enqueueSpin();
  }

  let roundCatch = 0;
  let jackpotGained = 0;
  function onAttacker() {
    updateBalls(SPEC.ATTACKER_PAY);
    jackpotGained += SPEC.ATTACKER_PAY;
    roundCatch++;
    Screen.jackpotBalls(`獲得 ${jackpotGained}発`);
  }

  /* ---------- 保留・抽選 ---------- */
  function enqueueSpin() {
    if (S.holdQueue.length >= 4) return; // オーバーフロー
    AudioMgr.se("hold", 0.3);
    // 入賞時点のモードで抽選（実機同様、先読み用に確定させる）
    const prob = S.mode === "rush" ? SPEC.RUSH_PROB : SPEC.NORMAL_PROB;
    const isWin = Math.random() < prob;
    const grade = isWin ? decideGrade(S.mode === "rush") : null;
    const pattern = pickPattern(isWin, S.mode !== "normal");
    const holdColor = pickHoldColor(isWin, pattern);
    if (holdColor >= 3) AudioMgr.se("kira2", 0.5);  // 赤保留以上で保留変化音
    if (holdColor === 5) Screen.glowFlash("rainbow", 1400);      // 虹保留：筐体虹点灯
    else if (holdColor >= 4) Screen.glowFlash("gold", 1000);     // 金保留：筐体金点灯
    S.holdQueue.push({ isWin, grade, pattern, holdColor });
    Screen.renderHolds(S.holdQueue);
    processQueue();
  }

  async function processQueue() {
    if (S.spinning || S.inJackpot || S.holdQueue.length === 0) return;
    S.spinning = true;
    const job = S.holdQueue.shift();
    Screen.renderHolds(S.holdQueue);
    try {
      await runSpin(job);
    } finally {
      S.spinning = false;
    }
    processQueue();
  }

  /* ---------- 変動実行 ---------- */
  async function runSpin(job) {
    const { isWin, grade, pattern } = job;
    S.spins++;
    S.totalSpins++;
    updateCounter();

    const quick = S.mode !== "normal"; // 電サポ中は高速変動
    Screen.startAll();

    // 図柄決定
    const symbols = decideSymbols(isWin, pattern, grade);

    switch (pattern.type) {
      case "quick":
        await wait(quick ? 700 : 1500);
        await Screen.stopReel(0, symbols[0]);
        await wait(quick ? 150 : 350);
        await Screen.stopReel(2, symbols[2]);
        await wait(quick ? 150 : 400);
        await Screen.stopReel(1, symbols[1]);
        break;

      case "yokoku": {
        await wait(800);
        // 弱予告：セリフ or 群（群はガセでも激熱げに）
        if (Math.random() < 0.15) await Screen.mobYokoku();
        else {
          const c = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
          await Screen.telop(`${c.name}「${c.quote}」`, 1400, "weak");
        }
        await Screen.stopReel(0, symbols[0]);
        await wait(300);
        await Screen.stopReel(2, symbols[2]);
        await wait(400);
        await Screen.stopReel(1, symbols[1]);
        break;
      }

      case "normal-reach":
        await runNormalReach(symbols, isWin, false);
        break;

      case "sp":
        await runSPReach(symbols, isWin, pattern.sp, false);
        break;

      case "spsp":
        await runSPReach(symbols, isWin, pattern.sp, true);
        break;

      case "zenkaiten":
        await runZenkaiten(symbols);
        break;
    }

    await wait(400);

    if (isWin) {
      await jackpotFlow(symbols, grade);
    } else {
      // モード消化
      if (S.mode !== "normal") {
        S.modeLeft--;
        if (S.modeLeft <= 0) await endMode();
        else updateModeUI();
      }
    }
  }

  function decideSymbols(isWin, pattern, grade) {
    if (isWin) {
      // 奇数=RUSH突入/継続の強グレード / 偶数=単発・2R
      const oddSide = grade === "double" || grade === "single";
      const pool = CHARACTERS.filter(c => (c.num % 2 === 1) === oddSide);
      const c = pool[Math.floor(Math.random() * pool.length)];
      const idx = CHARACTERS.indexOf(c);
      return [idx, idx, idx];
    }
    const a = Math.floor(Math.random() * 8);
    let b = Math.floor(Math.random() * 8);
    const hasReach = ["normal-reach", "sp", "spsp"].includes(pattern.type);
    if (hasReach) {
      // リーチハズレ：中図柄を±1ずらす
      b = (a + (Math.random() < 0.5 ? 1 : 7)) % 8;
      return [a, b, a];
    }
    let c = Math.floor(Math.random() * 8);
    if (b === a && c === a) b = (a + 3) % 8; // 偶然の当たり目を回避
    return [a, b, c];
  }

  async function runNormalReach(symbols, isWin, silent) {
    await wait(1200);
    await Screen.stopReel(0, symbols[0]);
    await wait(500);
    await Screen.stopReel(2, symbols[2]);
    if (!silent) {
      AudioMgr.se("reach", 0.5);
      AudioMgr.voice("reach");
      Screen.glowFlash("blue", 1200);   // リーチ成立：青点灯
      await Screen.reachTitle("リーチ！", 1200, "normal");
    }
    await wait(1800);
    await Screen.stopReel(1, symbols[1]);
    if (!isWin && !silent) AudioMgr.se("lose", 0.35);
  }

  async function runSPReach(symbols, isWin, sp, isSPSP) {
    // 予告段階
    await wait(1000);
    if (Math.random() < (isWin ? 0.5 : 0.15)) await Screen.mobYokoku();

    await Screen.stopReel(0, symbols[0]);
    await wait(450);
    await Screen.stopReel(2, symbols[2]);
    AudioMgr.se("reach", 0.5);
    AudioMgr.voice("reach");
    Screen.glowFlash("blue", 1200);   // リーチ成立：青点灯
    await Screen.reachTitle("リーチ！", 1000, "normal");

    // SP発展
    AudioMgr.se("pseudo", 0.5);
    AudioMgr.playBgm("reach");
    Screen.reelsVisible(false);
    Screen.miniDigits(true, `${CHARACTERS[symbols[0]].num} ● ${CHARACTERS[symbols[2]].num}`);
    Screen.setBg(sp.bg, true);
    Screen.playVideo("kiraBlue", { loop: true });   // SP中はキラキラ背景動画
    await Screen.reachTitle(sp.title, 2200, "sp");

    // ストーリーテロップ＋カットイン
    for (let i = 0; i < sp.lines.length; i++) {
      await Screen.telop(sp.lines[i], 1500, "story");
      if (i === 1 && sp.chars[0]) {
        Screen.playVideo("cutinBlue", { front: true, ms: 1600 });  // カットイン動画
        await Screen.cutin(sp.chars[0], "", 1500, sp.grade === "strong" ? "hot" : "");
        Screen.playVideo("kiraBlue", { loop: true });
      }
    }

    if (isSPSP) {
      // SPSP発展（最終決戦）
      Screen.flash("#ff4040", 500);
      AudioMgr.se("kyuin3", 0.55);
      AudioMgr.voice("atsui");
      Screen.fxKira("kiraLine1", 2000);
      Screen.glowFlash("gold", 2400);   // SPSP発展：金点灯（激アツ）
      Screen.playVideo("cutinRed", { front: true, ms: 2400 });   // 赤カットイン動画
      await Screen.reachTitle(SPSP_REACH.title, 2400, "spsp");
      Screen.setBg(SPSP_REACH.bg, true);
      for (const line of SPSP_REACH.lines) {
        await Screen.telop(line, 1400, "story hot");
      }
      // PUSHボタン
      const pressed = await Screen.pushButton(2800);
      if (pressed || true) {
        if (isWin) {
          AudioMgr.se("flash", 0.6);
          AudioMgr.se("hit", 0.7);
          Screen.fxKira("kiraLine2", 1800);
          Screen.glowFlash("red", 1800);   // 当り決着：赤点灯
          Screen.playVideo("gekiha", { front: true, ms: 2200 });  // 「撃破」動画
          Screen.flash("#ffd23f", 700);
          await Screen.cutin(SPSP_REACH.chars[0], "決着──！！", 1600, "hot");
        } else {
          AudioMgr.se("fail", 0.6);
          Screen.playVideo("jikai", { front: true, ms: 2000 });   // 「次回」動画
          Screen.flash("#5560a0", 500);
        }
      }
    } else {
      // SP決着
      await wait(600);
      if (isWin) {
        AudioMgr.se("flash", 0.6);
        AudioMgr.se("hit", 0.7);
        Screen.fxKira("kiraLine2", 1500);
        Screen.glowFlash("red", 1500);   // 当り決着：赤点灯
        Screen.playVideo("gekiha", { front: true, ms: 2000 });   // 「撃破」動画
        Screen.flash("#ffd23f", 700);
      } else {
        AudioMgr.se("fail", 0.55);
        Screen.playVideo("jikai", { front: true, ms: 1800 });    // 「次回」動画
      }
    }

    // 液晶復帰・図柄停止
    Screen.stopVideo();
    Screen.reelsVisible(true);
    Screen.miniDigits(false);
    restoreBg();
    await wait(600);
    await Screen.stopReel(1, symbols[1]);
    if (!isWin) {
      AudioMgr.se("lose", 0.35);
      bgmForMode();
    }
  }

  async function runZenkaiten(symbols) {
    // プレミア全回転
    AudioMgr.playBgm("reach");
    await wait(1200);
    AudioMgr.se("bingo", 0.55);
    Screen.setBg(BGS.wafuUme, false);
    Screen.fxKira("kiraLine1", 3500);
    Screen.glowFlash("rainbow", 4500);   // 全回転：虹点灯（プレミア）
    Screen.playVideo("kiraBlue", { loop: true });  // キラキラ背景動画
    await Screen.telop("――全回転――", 1800, "story hot");
    Screen.flash("#ffffff", 800);
    // 3リール同期回転の演出（順に高速で同一図柄を流す）
    for (let lap = 0; lap < 2; lap++) {
      for (let k = 0; k < 8; k++) {
        for (let i = 0; i < 3; i++) Screen.setSymbol(i, k);
        await wait(lap === 0 ? 120 : 260);
      }
    }
    for (let i = 0; i < 3; i++) await Screen.stopReel(i, symbols[0], i === 2);
    AudioMgr.se("hit", 0.8);
    Screen.flash("#ffd23f", 900);
    await wait(800);
    Screen.stopVideo();
  }

  /* ---------- 大当り ---------- */
  async function jackpotFlow(symbols, grade) {
    S.inJackpot = true;
    const char = CHARACTERS[symbols[0]];
    const g = GRADES[grade];
    const nextMode = g.next;

    // 連チャン数
    if (S.mode === "rush") S.renchan++;
    else S.renchan = 1;
    S.maxRenchan = Math.max(S.maxRenchan, S.renchan);
    S.hits++;
    if (nextMode === "rush") S.rushHits++;
    S.history.push({ rush: nextMode === "rush", label: g.label });
    S.spins = 0;
    updateCounter();

    // 当りファンファーレ＋筐体フル点灯
    AudioMgr.stopBgm();
    AudioMgr.se("fanfare", 0.7);
    AudioMgr.se("levelup", 0.55);
    AudioMgr.voice("jackpot");
    Screen.fxKira("kiraLine1", 2500);
    Screen.playVideo("kiraBlue", { ms: 4000 });   // 大当りファンファーレ：キラキラ背景動画
    Screen.flash("#ffd23f", 900);
    Screen.glow("pulse-fast", grade === "double" ? "rainbow" : "red");  // 大当り：赤（10R×2は虹）
    Screen.modeBanner(null);
    Screen.stCount(null);
    await wait(1200);

    AudioMgr.playBgm("jackpot", 0.4);
    Screen.jackpotShow(
      grade === "double" ? "大当り！！ 〜10R×2 BONUS〜"
        : grade === "mini" ? "BONUS"
        : "大当り！",
      char.key
    );
    updateModeUI(); // 右打ちランプ点灯
    $("migiuchi").classList.remove("hidden");
    Screen.lcdMsg("右打ちでアタッカーを狙え！", "alert");
    await wait(1800);
    Screen.lcdMsg(null);

    jackpotGained = 0;

    // ラウンド消化（doubleは10R×2セット）
    for (let set = 1; set <= g.sets; set++) {
      for (let r = 1; r <= g.rounds; r++) {
        Screen.jackpotRound(g.sets > 1
          ? `${set}回目 ROUND ${r} / ${g.rounds}`
          : `ROUND ${r} / ${g.rounds}`);
        Screen.jackpotChar(CHARACTERS[(symbols[0] + r + set) % 8].key);
        roundCatch = 0;
        Board.attackerOpen = true;
        const start = Date.now();
        while (roundCatch < SPEC.ROUND_CATCH && Date.now() - start < SPEC.ROUND_TIMEOUT_MS) {
          await wait(100);
        }
        Board.attackerOpen = false;
        await wait(700);
      }
      if (set < g.sets) {
        AudioMgr.se("fanfare", 0.7);
        Screen.flash("#ffd23f", 700);
        await Screen.telop("NEXT BONUS！！ さらに約1500個！", 2200, "story hot");
      }
    }

    // 終了画面
    Screen.jackpotRound("");
    if (nextMode === "rush") {
      Screen.jackpotBalls(`獲得 ${jackpotGained}発  /  ${S.renchan}連チャン！`);
      AudioMgr.voice("rush");
      Screen.fxKira("kiraLine2", 2000);
      await Screen.telop("常総RUSH " + (S.mode === "rush" ? "継続！！" : "突入！！"), 2000, "story hot");
    } else {
      Screen.jackpotBalls(`獲得 ${jackpotGained}発`);
      await Screen.telop("左打ちに戻してください", 2000, "story");
    }
    Screen.jackpotHide();

    // モード移行
    S.mode = nextMode;
    S.modeLeft = nextMode === "rush" ? SPEC.ST_COUNT : 0;
    S.inJackpot = false;
    updateModeUI();
    bgmForMode();
    restoreBg();
    processQueue();
  }

  async function endMode() {
    S.mode = "normal";
    S.modeLeft = 0;
    S.renchan = 0;
    updateModeUI();
    AudioMgr.se("chime", 0.35);  // 放課後のチャイム
    AudioMgr.playBgm("sad");
    await Screen.telop("RUSH終了…… また明日から頑張ろう", 2200, "story");
    await wait(1000);
    AudioMgr.playBgm("normal");
    restoreBg();
  }

  function restoreBg() {
    if (S.mode === "rush") Screen.setBg(BGS.cyber1);
    else Screen.setBg(BGS.classroom);
  }

  /* ---------- 発射管理 ---------- */
  let launchTimer = null;
  function setHandle(strength) {
    if (strength > 0 && !launchTimer) {
      launchTimer = setInterval(() => {
        if (S.balls <= 0) return;
        updateBalls(-1);
        Board.launch(currentStrength());
      }, 600); // 発射100発/分
    } else if (strength === 0 && launchTimer) {
      clearInterval(launchTimer);
      launchTimer = null;
    }
  }

  let _strength = 0;
  function currentStrength() { return _strength; }
  function updateStrength(v) {
    _strength = v;
    setHandle(v);
  }

  /* ---------- 初期化 ---------- */
  function init() {
    Board.handlers.onHeso = onHeso;
    Board.handlers.onDenchu = onDenchu;
    Board.handlers.onAttacker = onAttacker;

    // 初期図柄（バラバラ）
    Screen.setSymbol(0, 0);
    Screen.setSymbol(1, 3);
    Screen.setSymbol(2, 6);
    restoreBg();
    updateBalls(0);
    updateCounter();
    updateModeUI();
  }

  return { init, updateStrength, updateBalls, get state() { return S; } };
})();
