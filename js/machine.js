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
    rushGained: 0,           // RUSH突入からの累計獲得玉数
    rushActive: false,       // RUSHセッション中フラグ
    history: [],             // {type:"rush10"|"jitan4"|...}
  };

  // テストプレイ用フラグ
  let _forceWin = false;
  let _forceGrade = null;

  /* ---------- UI更新 ---------- */
  function updateBalls(delta) {
    S.balls += delta;
    const txt = S.balls.toLocaleString();
    $("ball-count").textContent = txt;
    $("ball-count").classList.toggle("minus", S.balls <= 0);
    const dcb = $("dc-balls");
    if (dcb) dcb.textContent = txt;
  }

  function updateCounter() {
    $("dc-spins").textContent = S.spins;
    Screen.spinDisplay(S.spins);
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
      Screen.modeBanner(null);
      Screen.stCount(null);
      // 常総RUSH×連チャン数／獲得玉数／残り回数を宝石数字で表示
      Screen.rushInfo(true, S.renchan, S.rushGained, S.modeLeft);
    } else {
      Screen.modeBanner(null);
      Screen.stCount(null);
      Screen.rushInfo(false);
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
    if (S.rushActive) { S.rushGained += SPEC.DENCHU_PAY; }
    if (S.mode !== "normal") enqueueSpin();
  }

  let roundCatch = 0;
  let jackpotGained = 0;
  function onAttacker() {
    updateBalls(SPEC.ATTACKER_PAY);
    jackpotGained += SPEC.ATTACKER_PAY;
    if (S.rushActive) { S.rushGained += SPEC.ATTACKER_PAY; }
    roundCatch++;
    Screen.jackpotBalls(`獲得 ${jackpotGained}発`);
  }

  /* ---------- 保留・抽選 ---------- */
  function enqueueSpin() {
    if (S.holdQueue.length >= 4) return; // オーバーフロー
    AudioMgr.se("hold", 0.3);
    // 入賞時点のモードで抽選（実機同様、先読み用に確定させる）
    const isRush = S.mode !== "normal";
    const prob = isRush ? SPEC.RUSH_PROB : SPEC.NORMAL_PROB;
    const isWin = _forceWin ? true : (Math.random() < prob);
    const grade = isWin ? (_forceGrade || decideGrade(isRush)) : null;
    _forceWin = false; _forceGrade = null;
    // 図柄の見せ方：RUSH結果でも45%だけ奇数図柄で即確定、残りは偶数図柄にして
    // 10R終了時の当落判定に持ち越す（偶数＝即RUSH否定にしない）
    let showOdd = null;
    if (isWin) {
      showOdd = (GRADES[grade].next === "rush") ? (Math.random() < 0.45) : false;
    }
    const mob = decideMob(isWin, isRush);
    let pattern = pickPattern(isWin, isRush);
    // 群予告が出るならリーチ以上に格上げ（群→リーチの流れを保証）
    if (mob && (pattern.type === "quick" || pattern.type === "yokoku")) {
      pattern = { type: "normal-reach" };
    }
    const holdColor = pickHoldColor(isWin, pattern);
    if (holdColor >= 3) AudioMgr.se("kira2", 0.5);  // 赤保留以上で保留変化音
    if (holdColor === 5) Screen.glowFlash("rainbow", 1400);      // 虹保留：筐体虹点灯
    else if (holdColor >= 4) Screen.glowFlash("gold", 1000);     // 金保留：筐体金点灯
    S.holdQueue.push({ isWin, grade, pattern, holdColor, mob, showOdd });
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
    const { isWin, grade, pattern, mob, showOdd } = job;
    S.spins++;
    S.totalSpins++;
    updateCounter();

    const quick = S.mode !== "normal"; // 電サポ中は高速変動
    Screen.clearPose();
    Screen.confirmBg(false);
    Screen.startAll();

    // 図柄決定
    const symbols = decideSymbols(isWin, pattern, grade, showOdd);

    // 群予告（当落連動・信頼度約60%）
    if (mob) await Screen.mobYokoku();

    switch (pattern.type) {
      case "quick":
        // RUSH中は高速消化（通常時 ＜ RUSH の体感差をつける）
        await wait(quick ? 420 : 1500);
        await Screen.stopReel(0, symbols[0]);
        await wait(quick ? 90 : 350);
        await Screen.stopReel(2, symbols[2]);
        await wait(quick ? 90 : 400);
        await Screen.stopReel(1, symbols[1]);
        break;

      case "yokoku": {
        await wait(800);
        // 弱予告：セリフ
        const c = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        await Screen.telop(`${c.name}「${c.quote}」`, 1400, "weak");
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
      await jackpotFlow(symbols, grade, showOdd);
    } else {
      // モード消化
      if (S.mode !== "normal") {
        S.modeLeft--;
        if (S.modeLeft <= 0) await endMode();
        else updateModeUI();
      }
    }
  }

  // 図柄インデックス6 = num7 = 「7図柄」（7テンパイ=当り確定のため厳格管理）
  function decideSymbols(isWin, pattern, grade, showOdd) {
    if (isWin) {
      // 奇数図柄＝即RUSH確定 / 偶数図柄＝10R終了時に当落判定に持ち越し
      const oddSide = !!showOdd;
      const pool = CHARACTERS.filter(c => (c.num % 2 === 1) === oddSide);
      const c = pool[Math.floor(Math.random() * pool.length)];
      const idx = CHARACTERS.indexOf(c);
      return [idx, idx, idx];
    }
    const hasReach = ["normal-reach", "sp", "spsp"].includes(pattern.type);
    if (hasReach) {
      // リーチハズレ：外側の図柄に7図柄(index6)は使わない
      let a = Math.floor(Math.random() * 7);  // 0..6
      if (a === 6) a = 7;                      // {0,1,2,3,4,5,7} = index6を除外
      const b = (a + (Math.random() < 0.5 ? 1 : 7)) % 8; // 中図柄を±1ずらす
      return [a, b, a];
    }
    // 非リーチ：外側2つを必ず不一致に（偶然のテンパイ＝7-7を防ぐ）
    const a = Math.floor(Math.random() * 8);
    let c = Math.floor(Math.random() * 8);
    if (c === a) c = (a + 3) % 8;
    const b = Math.floor(Math.random() * 8);
    return [a, b, c];
  }

  /* 7図柄テンパイの即時確定カット */
  async function sevenTenpaiCue() {
    AudioMgr.se("kyuin3", 0.6);
    Screen.glowFlash("rainbow", 2400);
    Screen.flash("#fff", 300);
    await Screen.reachTitle("７図柄テンパイ！！", 1300, "spsp");
  }

  /* 激熱確定背景（出現＝当り確定のプレミア演出） */
  async function doConfirm(symbols) {
    const seven = symbols[0] === 6 && symbols[2] === 6;
    AudioMgr.playBgm("rush");   // 確定の特別曲（RUSH時BGM）
    AudioMgr.se("kyuin3", 0.6);
    AudioMgr.voice("atsui");
    Screen.reelsVisible(false);
    Screen.confirmBg(true);
    Screen.glowFlash("rainbow", 3000);
    Screen.flash("#ffffff", 500);
    await Screen.reachTitle(seven ? "大当り確定！！" : "激熱！ 大当り確定！！", 2600, "spsp");
    Screen.reelsVisible(true);
  }

  async function runNormalReach(symbols, isWin, silent) {
    await wait(1200);
    await Screen.stopReel(0, symbols[0]);
    await wait(500);
    await Screen.stopReel(2, symbols[2], { decel: true });   // 2つ目は減速停止
    const reach = symbols[0] === symbols[2];
    const seven = symbols[0] === 6 && symbols[2] === 6;
    if (reach) Screen.tenpaiPose(true);
    if (!silent && reach) {
      AudioMgr.se("reach", 0.5);
      AudioMgr.voice("reach");
      Screen.glowFlash("blue", 1200);   // リーチ成立：青点灯
      Screen.showTextImg("reach", 1200);  // リーチ文字画像
      await wait(1100);
      if (seven) await sevenTenpaiCue();
    }
    // 確定背景（当り時のみ／7図柄なら必ず）
    if (decideConfirm(isWin, symbols)) await doConfirm(symbols);
    await wait(1500);
    await Screen.stopReel(1, symbols[1], { decel: true });
    if (isWin) { Screen.winPose(); AudioMgr.se("hit", 0.6); }
    else if (!silent) AudioMgr.se("lose", 0.35);
    Screen.tenpaiPose(false);
    Screen.confirmBg(false);
  }

  async function runSPReach(symbols, isWin, sp, isSPSP) {
    // 予告段階
    await wait(1000);

    await Screen.stopReel(0, symbols[0]);
    await wait(450);
    await Screen.stopReel(2, symbols[2], { decel: true });   // 2つ目は減速停止
    const seven = symbols[0] === 6 && symbols[2] === 6;
    Screen.tenpaiPose(true);
    AudioMgr.se("reach", 0.5);
    AudioMgr.voice("reach");
    Screen.glowFlash("blue", 1200);   // リーチ成立：青点灯
    Screen.showTextImg("reach", 1100);  // リーチ文字画像
    await wait(1000);
    if (seven) await sevenTenpaiCue();

    // SP発展
    AudioMgr.se("pseudo", 0.5);
    AudioMgr.playBgm("reach");
    Screen.reelsVisible(false);
    Screen.miniDigits(true, `${CHARACTERS[symbols[0]].num} ● ${CHARACTERS[symbols[2]].num}`);
    // まず1枚絵を明るくクリア表示（cover・余白なし）。panなら左端(石川)から
    Screen.setBg(sp.bg, false);
    if (sp.pan) Screen.setBgPos("0% 50%");
    await Screen.reachTitle(sp.title, 2200, "sp");
    // その後、うっすらキラキラ背景動画を重ねる（1枚絵は透けて見える）
    Screen.playVideo("kiraBlue", { loop: true, opacity: 0.35 });

    // ストーリーテロップ＋カットイン
    for (let i = 0; i < sp.lines.length; i++) {
      // panSP：左(石川)を映したあと、右(西山)へカメラを移動
      if (sp.pan && i === 2) Screen.panBg("0% 50%", "100% 50%", 1600);
      await Screen.telop(sp.lines[i], 1500, "story");
      if (i === 1 && sp.chars[0]) {
        // キラを一旦止めてキャラを見せる。カットイン動画は短い導入のみ＆薄め
        Screen.stopVideo();
        Screen.playVideo("cutinBlue", { front: true, ms: 650, opacity: 0.5 });
        await Screen.cutin(sp.chars[0], "", 1500, sp.grade === "strong" ? "hot" : "");
        Screen.playVideo("kiraBlue", { loop: true, opacity: 0.35 });
      }
    }

    // 激熱確定背景（出現＝当り確定のプレミア割り込み。7図柄なら必ず）
    if (decideConfirm(isWin, symbols)) {
      Screen.stopVideo();
      await doConfirm(symbols);
      Screen.confirmBg(false);
      Screen.setBg(sp.bg, false);
      if (sp.pan) Screen.setBgPos("100% 50%");
    }

    if (isSPSP) {
      // SPSP発展（生徒会長決戦 小丹 VS 伊藤輝明）
      Screen.stopVideo();
      Screen.flash("#ff4040", 500);
      AudioMgr.se("kyuin3", 0.55);
      AudioMgr.voice("atsui");
      Screen.fxKira("kiraLine1", 2000);
      Screen.glowFlash("gold", 2400);   // SPSP発展：金点灯（激アツ）
      await Screen.reachTitle(SPSP_REACH.title, 2000, "spsp");
      // 小丹の選挙1枚絵
      Screen.setBg(SPSP_IMGS.kotan, false);
      await Screen.telop(SPSP_REACH.lines[0], 1600, "story hot");
      // VS 3D文字アニメーション
      AudioMgr.se("kyuin3", 0.6);
      Screen.flash("#ffffff", 350);
      Screen.playVideo("vs3d", { front: true, ms: 2400 });
      await wait(2200);
      // 伊藤輝明の選挙1枚絵
      Screen.setBg(SPSP_IMGS.ito, false);
      await Screen.telop(SPSP_REACH.lines[1], 1600, "story hot");
      await Screen.telop(SPSP_REACH.lines[2], 1500, "story hot");
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
      // SP決着：通常時はタメを長く取って当落のドキドキを演出（RUSH中は短く）
      const tame = (S.mode === "normal") ? 2400 : 500;
      if (S.mode === "normal") {
        Screen.lcdMsg("果たして結果は…！？", "alert");
        AudioMgr.se("drumroll", 0.45);
        Screen.glowFlash("gold", tame);
        await wait(tame * 0.6);
        Screen.flash("#fff", 200);     // 一瞬の煽り
        await wait(tame * 0.4);
        Screen.lcdMsg(null);
      } else {
        await wait(tame);
      }
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
    Screen.confirmBg(false);
    Screen.reelsVisible(true);
    Screen.miniDigits(false);
    restoreBg();
    await wait(600);
    await Screen.stopReel(1, symbols[1], { decel: true });
    if (isWin) {
      Screen.winPose();
    } else {
      AudioMgr.se("lose", 0.35);
      bgmForMode();
    }
    Screen.tenpaiPose(false);
  }

  async function runZenkaiten(symbols) {
    // プレミア全回転（特別曲 RUSH時BGM を流す）
    AudioMgr.playBgm("rush");
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
  // 1セット分（10R等）のラウンド消化
  async function playSet(setNo, totalSets, rounds, baseIdx) {
    for (let r = 1; r <= rounds; r++) {
      Screen.jackpotRound(totalSets > 1
        ? `${setNo}セット目 ROUND ${r} / ${rounds}`
        : `ROUND ${r} / ${rounds}`);
      Screen.jackpotChar(CHARACTERS[(baseIdx + r + setNo) % 8].key);
      roundCatch = 0;
      Board.attackerOpen = true;
      const start = Date.now();
      while (roundCatch < SPEC.ROUND_CATCH && Date.now() - start < SPEC.ROUND_TIMEOUT_MS) {
        await wait(100);
      }
      Board.attackerOpen = false;
      await wait(650);
    }
  }

  // RUSH当落判定（10R終了時）。immediate=奇数図柄等で既に確定済みなら短くお祝いのみ
  async function rushJudge(willRush, immediate, wasRush) {
    if (immediate) {
      AudioMgr.se("fanfare", 0.6);
      AudioMgr.voice("rush");
      Screen.glowFlash("rainbow", 1800);
      Screen.fxKira("kiraLine2", 1600);
      if (!wasRush) Screen.rushSplash("logo", 1900);        // 突入：常総RUSHロゴ
      else Screen.showTextImg("rushKakutei", 1900);         // 継続：確定文字
      await wait(1800);
      return;
    }
    // 当落判定のタメ（ドキドキ）
    Screen.lcdMsg("RUSH当落 判定中…！", "alert");
    AudioMgr.se("drumroll", 0.5);
    Screen.glowFlash("gold", 2800);
    await wait(2600);
    Screen.lcdMsg(null);
    if (willRush) {
      AudioMgr.se("flash", 0.6);
      AudioMgr.se("hit", 0.7);
      AudioMgr.voice("rush");
      Screen.flash("#ffd23f", 700);
      Screen.glowFlash("rainbow", 2400);
      Screen.fxKira("kiraLine2", 1800);
      if (!wasRush) Screen.rushSplash("logo", 2200);        // 突入：常総RUSHロゴ
      else Screen.showTextImg("rushKakutei", 2100);         // 継続：確定文字
      await wait(2000);
    } else {
      AudioMgr.se("fail", 0.55);
      Screen.glowFlash("blue", 1200);
      Screen.rushSplash("batsu", 1900);   // 単発転落：×の大表示
      await Screen.telop("…残念、今回は単発。次回に期待！", 2000, "story");
    }
  }

  // 10R×2の継続をギリギリで告知
  async function nextBonusReveal() {
    Screen.lcdMsg("継続なるか…！？", "alert");
    AudioMgr.se("drumroll", 0.5);
    await wait(2400);   // ギリギリまで引っ張る
    Screen.lcdMsg(null);
    AudioMgr.se("fanfare", 0.75);
    AudioMgr.se("levelup", 0.5);
    Screen.flash("#ffd23f", 800);
    Screen.glowFlash("rainbow", 2600);
    await Screen.telop("NEXT BONUS！！ 10R×2 約3000個！", 2200, "story hot");
  }

  async function jackpotFlow(symbols, grade, showOdd) {
    S.inJackpot = true;
    Screen.confirmBg(false);
    Screen.clearPose();
    const char = CHARACTERS[symbols[0]];
    const g = GRADES[grade];
    const nextMode = g.next;
    const rushResult = nextMode === "rush";
    const wasRush = S.mode === "rush";
    const immediate = !!showOdd && rushResult;   // 奇数図柄RUSH＝即確定
    // RUSH中は継続が前提なので判定は短くお祝い演出に
    const judgeImmediate = immediate || wasRush;

    // RUSHセッション管理：初回突入で獲得玉数をリセット、継続は累積を維持
    if (rushResult) {
      if (!wasRush) { S.rushGained = 0; }   // 初回突入でリセット
      S.rushActive = true;
    }

    // 連チャン数
    if (wasRush) S.renchan++;
    else S.renchan = 1;
    S.maxRenchan = Math.max(S.maxRenchan, S.renchan);
    S.hits++;
    if (rushResult) S.rushHits++;
    S.history.push({ rush: rushResult, label: g.label });
    S.spins = 0;
    updateCounter();

    // 当りファンファーレ＋筐体フル点灯
    AudioMgr.stopBgm();
    AudioMgr.se("fanfare", 0.7);
    AudioMgr.se("levelup", 0.55);
    AudioMgr.voice("jackpot");
    Screen.fxKira("kiraLine1", 2500);
    Screen.playVideo("kiraBlue", { ms: 4000 });
    Screen.flash("#ffd23f", 900);
    Screen.glow("pulse-fast", immediate ? "rainbow" : "red");  // 即確定は虹、それ以外は赤（伏せ）
    Screen.modeBanner(null);
    Screen.stCount(null);
    Screen.rushInfo(false);
    await wait(1200);

    AudioMgr.playBgm("jackpot", 0.4);
    // 即確定でなければ当落は伏せる（偶数図柄でも「大当り！」表記）
    Screen.jackpotShow(immediate ? "大当り！！ 〜常総RUSH確定〜" : "大当り！", char.key);
    Screen.showTextImg("atari", 1900);   // 大当たり文字画像
    updateModeUI(); // 右打ちランプ点灯
    $("migiuchi").classList.remove("hidden");
    await wait(1700);
    Screen.showTextImg("migiuchi", 1600); // 右打ち文字画像
    Screen.lcdMsg("右打ちでアタッカーを狙え！", "alert");
    await wait(1500);
    Screen.lcdMsg(null);

    jackpotGained = 0;

    // 1セット目のラウンド消化
    await playSet(1, g.sets, g.rounds, symbols[0]);

    // ---- 前半（10R等）終了時の判定 ----
    if (grade === "double") {
      // まずRUSH当落 → ギリギリで継続(10R×2)告知 → 2セット目
      await rushJudge(true, judgeImmediate, wasRush);
      await nextBonusReveal();
      await playSet(2, g.sets, g.rounds, symbols[0]);
    } else if (rushResult) {
      // single / mini：RUSH当落判定
      await rushJudge(true, judgeImmediate, wasRush);
    } else {
      // tanpatsu：転落（単発終了）
      await rushJudge(false, false, wasRush);
    }

    // 終了画面
    Screen.jackpotRound("");
    Screen.jackpotBalls(rushResult
      ? `獲得 ${jackpotGained}発  /  ${S.renchan}連チャン！`
      : `獲得 ${jackpotGained}発`);
    await wait(600);
    if (!rushResult) await Screen.telop("左打ちに戻してください", 1600, "story");
    Screen.jackpotHide();

    // モード移行
    S.mode = nextMode;
    S.modeLeft = rushResult ? SPEC.ST_COUNT : 0;
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
    S.rushActive = false;   // RUSHセッション終了
    updateModeUI();
    AudioMgr.se("chime", 0.35);  // 放課後のチャイム
    AudioMgr.playBgm("sad");
    Screen.rushSplash("batsu", 2000);   // RUSH終了：×の大表示
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

  /* ---------- テストプレイ用機能 ---------- */
  // 次の1回転を強制的に当たりにする（grade指定可）
  function testHit(grade) {
    _forceWin = true;
    _forceGrade = grade || (S.mode === "rush" ? "double" : "double");
    // 発射していなくてもヘソ入賞を1発発生させて変動を起こす
    onHeso();
  }
  // RUSH突入を即体験（10R×2＋RUSH）
  function testRush() { testHit("double"); }

  // テスト用に大当り確率を切り替える（表示文字列を返す）
  const PROB_CYCLE = [
    { normal: 1 / 349.9, rush: 1 / 99.9, label: "1/349.9" },
    { normal: 1 / 30,    rush: 1 / 30,   label: "1/30" },
    { normal: 1 / 10,    rush: 1 / 10,   label: "1/10" },
    { normal: 1 / 3,     rush: 1 / 3,    label: "1/3" },
  ];
  let _probIdx = 0;
  function cycleProb() {
    _probIdx = (_probIdx + 1) % PROB_CYCLE.length;
    const p = PROB_CYCLE[_probIdx];
    SPEC.NORMAL_PROB = p.normal;
    SPEC.RUSH_PROB = p.rush;
    return p.label;
  }

  return {
    init, updateStrength, updateBalls,
    testHit, testRush, cycleProb,
    get state() { return S; },
  };
})();
