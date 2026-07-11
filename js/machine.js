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
    rushInfoInJackpot: false,
    history: [],             // {type:"rush10"|"jitan4"|...}
    stage: 0,                // 通常時ステージ（STAGES index）
    stageSpins: 0,           // 現ステージでの消化回転数
    stageSpan: STAGE_SPAN(), // 次のステージ移行までの回転数
    pendingChance: false,    // 先読み：荒川沖駅（チャンスステージ）へ移行予約
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

  function refreshRushInfo() {
    const showRushInfo = (S.mode === "rush" && !S.inJackpot) || (S.inJackpot && S.rushInfoInJackpot);
    $("rush-info").classList.toggle("jackpot", S.inJackpot && S.rushInfoInJackpot);
    $("jackpot-layer").classList.toggle("rush-info-only", S.inJackpot && S.rushInfoInJackpot);
    Screen.rushInfo(showRushInfo, S.renchan, S.rushGained, S.inJackpot ? null : S.modeLeft);
  }

  function setJackpotRushInfo(show) {
    S.rushInfoInJackpot = !!show && S.rushActive;
    refreshRushInfo();
  }

  function updateModeUI() {
    const migiuchi = S.mode !== "normal" || S.inJackpot;
    $("migiuchi").classList.toggle("hidden", !migiuchi);
    // 大当り中まで電チューを開くと、2回目以降の右打ち玉が
    // アタッカーへ届く前に電チューへ吸われるため、ラウンド中は閉じる。
    Board.denchuOpen = S.mode !== "normal" && !S.inJackpot;

    if (S.mode === "rush") {
      Screen.modeBanner(null);
      Screen.stCount(null);
      // 常総RUSH×連チャン数／獲得玉数／残り回数を宝石数字で表示
    } else {
      Screen.modeBanner(null);
      Screen.stCount(null);
    }
    refreshRushInfo();
    if (!S.inJackpot) {
      if (S.mode === "rush") Screen.glow("pulse-slow", "rainbow");
      else Screen.glow("");
    }
  }

  function bgmForMode() {
    if (S.mode === "rush") {
      // RUSH中は常に歌もの「常総の帰り道」＋歌詞テロップ
      AudioMgr.playBgm("rush", 0.6);
      Screen.lyricsStart(KAERIMICHI_LYRICS, () => AudioMgr.bgmTime("rush"));
    } else {
      Screen.lyricsStop();
      AudioMgr.playBgm(STAGES[S.stage].bgm);
    }
  }

  /* ---------- 通常時ステージ管理 ---------- */
  function changeStage(idx, playBgm = true) {
    if (idx === S.stage) return;
    S.stage = idx;
    S.stageSpins = 0;
    S.stageSpan = STAGE_SPAN();
    const st = STAGES[idx];
    Screen.setBg(st.bg);
    Screen.stagePlate(st.plate, 1700);
    AudioMgr.se("kira", 0.4);
    if (st.chance) Screen.glowFlash("blue", 1500);   // チャンスステージは青点灯で示唆
    if (playBgm && S.mode === "normal" && !S.inJackpot) AudioMgr.playBgm(st.bgm);
  }

  /* 変動開始ごとのステージ進行（先読みチャンス移行／定期ローテーション） */
  function stepStage() {
    if (S.mode !== "normal") return;
    S.stageSpins++;
    if (S.pendingChance && S.stage !== CHANCE_STAGE) {
      S.pendingChance = false;
      changeStage(CHANCE_STAGE);
      return;
    }
    if (S.stageSpins >= S.stageSpan) {
      // チャンスステージ以外へローテーション
      let next = Math.floor(Math.random() * (STAGES.length - 1));
      if (next === S.stage) next = (next + 1) % (STAGES.length - 1);
      changeStage(next);
    }
  }

  /* ---------- 入賞ハンドラ ---------- */
  function onHeso() {
    updateBalls(SPEC.HESO_PAY);
    enqueueSpin();
  }

  function onDenchu() {
    if (S.mode !== "normal") enqueueSpin();
  }

  let roundCatch = 0;
  let jackpotGained = 0;
  let jackpotTarget = 0;
  function onAttacker() {
    updateBalls(SPEC.ATTACKER_PAY);
    // オーバー入賞：賞球は払うがカウンター表示には数えない（分母超え防止）
    if (roundCatch >= SPEC.ROUND_CATCH) return;
    if (roundCatch === 0) AudioMgr.se("payout", 0.16);
    jackpotGained += SPEC.ATTACKER_PAY;
    if (S.rushActive) {
      S.rushGained += SPEC.ATTACKER_PAY;
      refreshRushInfo();
    }
    roundCatch++;
    // 規定カウント到達で即閉鎖（開きっぱなしで数が超えるのを防ぐ）
    if (roundCatch >= SPEC.ROUND_CATCH) Board.attackerOpen = false;
    Screen.jackpotBalls(jackpotGained, jackpotTarget);
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
    // 金・虹保留は告知音で「当たるかも」を煽る（RUSH中はBGMを活かして省略）
    if (S.mode === "normal" && holdColor >= 4) AudioMgr.se("kyuin3", 0.6);
    // 先読み：当り保留の50%で荒川沖駅（チャンスステージ）へ移行予約
    if (S.mode === "normal" && isWin && Math.random() < 0.5) S.pendingChance = true;
    if (holdColor === 5) {
      AudioMgr.seStack([
        { key: "rainbowFlash", volume: 0.52 },
        { key: "kyuinBoost", volume: 0.24, delay: 100 },
      ], { duckFactor: 0.55, duckMs: 1500 });
      Screen.glowFlash("rainbow", 1400);                         // 虹保留：筐体虹点灯
    }
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
    stepStage();                       // ステージ進行（通常時のみ）
    Screen.clearPose();
    Screen.confirmBg(false);
    Screen.startAll();

    // 図柄決定
    const symbols = decideSymbols(isWin, pattern, grade, showOdd);

    // 擬似連「追試」：一度止まったように見せて再変動（回数が多いほど期待度UP）
    const tsuishi = (S.mode === "normal") ? decideTsuishi(isWin, pattern) : 0;
    for (let i = 0; i < tsuishi; i++) await tsuishiRespin();

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
        // RUSH中は先生バトル（勝利＝大当り継続）
        if (S.mode !== "normal") await runTeacherBattle(symbols, isWin);
        else await runSPReach(symbols, isWin, pattern.sp, false);
        break;

      case "spsp":
        if (S.mode !== "normal") await runTeacherBattle(symbols, isWin);
        else await runSPReach(symbols, isWin, pattern.sp, true);
        break;

      case "zenkaiten":
        await runZenkaiten(symbols);
        break;
    }

    await wait(400);

    if (isWin) {
      await jackpotFlow(symbols, grade, showOdd, pattern);
    } else {
      // モード消化
      if (S.mode !== "normal") {
        S.modeLeft--;
        if ([10, 5, 1].includes(S.modeLeft)) AudioMgr.se("lastChance", 0.34);
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

  /* 擬似連「追試」：チャンス目で一旦停止→追試スプラッシュ→再変動 */
  async function tsuishiRespin() {
    await wait(900);
    // チャンス目（順目・非テンパイ）で仮停止
    const k = Math.floor(Math.random() * 8);
    await Screen.stopReel(0, k);
    await wait(220);
    await Screen.stopReel(2, (k + 2) % 8);
    await wait(260);
    await Screen.stopReel(1, (k + 1) % 8);
    await wait(350);
    AudioMgr.se("tsuishi", 0.6);   // 追試スタンプ音
    Screen.rushSplash(TSUISHI_IMG, 1300);
    Screen.glowFlash("blue", 1300);
    Screen.flash("#9fc4ff", 300);
    await wait(1300);
    Screen.startAll();   // 再変動
  }

  /* RUSH中の先生バトル（勝利＝大当り継続／敗北＝ハズレ） */
  async function runTeacherBattle(symbols, isWin) {
    const t = pickTeacherBattle();
    await wait(500);
    await Screen.stopReel(0, symbols[0]);
    await wait(280);
    await Screen.stopReel(2, symbols[2], { decel: true });
    Screen.tenpaiPose(true);
    AudioMgr.se("reach", 0.5);
    Screen.glowFlash("blue", 1000);
    Screen.showTextImg("reach", 1000);
    await wait(900);

    // バトル突入（RUSH中のBGMは維持したまま）
    AudioMgr.se("pseudo", 0.5);
    Screen.reelsEventMode(true);
    Screen.miniDigits(false);
    Screen.setBg(t.img, false);
    Screen.setBgPos("50% 12%");   // 縦長の先生画像は頭が切れないよう上寄せ
    Screen.playVideo("vs3d", { front: true, ms: 1800, opacity: 0.6 });
    await Screen.reachTitle(t.title, 1800, "sp");
    await Screen.telop(t.intro, 1500, "story");
    for (const ln of t.lines) await Screen.telop(ln, 1400, "story hot");
    await Screen.pushButton(2400);

    if (isWin) {
      AudioMgr.se("flash", 0.6);
      AudioMgr.se("hit", 0.7);
      Screen.fxKira("kiraLine2", 1500);
      Screen.glowFlash("red", 1500);
      Screen.playVideo("gekiha", { front: true, ms: 2000 });
      Screen.flash("#ffd23f", 600);
      if (TEACHER_CONFIRM_IMGS[t.id]) {
        Screen.stopVideo();
        Screen.setBg(TEACHER_CONFIRM_IMGS[t.id], false);
        await Screen.reachTitle("バトル突破 大当り確定！！", 1600, "spsp");
      }
      await Screen.telop(t.winLine, 1600, "story hot");
    } else {
      // 敗北：先生の怒り差分に切り替えて叱られる
      Screen.setBg(t.angry, false);
      Screen.setBgPos("50% 12%");
      Screen.flash("#ff3030", 400);
      AudioMgr.se("wara", 0.65);   // 紙束を叩きつける「わら！」
      Screen.playVideo("jikai", { front: true, ms: 1800 });
      await Screen.telop(t.loseLine, 1800, "story hot");
    }

    Screen.stopVideo();
    Screen.reelsEventMode(false);
    Screen.miniDigits(false);
    restoreBg();
    await wait(400);
    await Screen.stopReel(1, symbols[1], { decel: true });
    if (isWin) Screen.winPose();
    else AudioMgr.se("lose", 0.3);
    Screen.tenpaiPose(false);
  }

  /* 7図柄テンパイの即時確定カット */
  async function sevenTenpaiCue() {
    // RUSH中はRUSH時BGMに告知音を被せない
    AudioMgr.seStack([
      { key: "sevenJackpot", volume: 0.72 },
      { key: "kyuinBoost", volume: 0.34, delay: 140 },
    ], { duckFactor: 0.28, duckMs: 2600 });
    Screen.glowFlash("rainbow", 2400);
    Screen.flash("#fff", 300);
    await Screen.reachTitle("７図柄テンパイ！！", 1300, "spsp");
  }

  /* 激熱確定背景（出現＝当り確定のプレミア演出） */
  async function doConfirm(symbols) {
    const seven = symbols[0] === 6 && symbols[2] === 6;
    // RUSH中はRUSH時BGMを流し続ける（BGM切替も告知音も被せない）
    if (S.mode === "normal") {
      AudioMgr.playBgm("jackpot");   // 確定演出ではRUSH時BGMを先出ししない
      AudioMgr.seStack([
        { key: "kyuinBoost", volume: 0.56 },
        { key: "rainbowFlash", volume: 0.32, delay: 100 },
      ], { duckFactor: 0.32, duckMs: 2400 });
    }
    AudioMgr.voice("atsui");
    const wasEventMode = Screen.reelsEventMode(true);
    Screen.confirmBg(true);
    Screen.glowFlash("rainbow", 3000);
    Screen.flash("#ffffff", 500);
    await Screen.reachTitle(seven ? "大当り確定！！" : "激熱！ 大当り確定！！", 2600, "spsp");
    if (!wasEventMode) Screen.reelsEventMode(false);
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

    // SP発展（RUSH中はRUSH時BGMを維持したまま発展させる）
    AudioMgr.se("pseudo", 0.5);
    if (S.mode === "normal") AudioMgr.playBgm("reach");
    Screen.reelsEventMode(true);
    Screen.miniDigits(false);
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
      // SPSP発展。専用画像があるイベントは、発展直後に一度クリア表示する。
      const spspEvent = sp.spsp || null;
      Screen.stopVideo();
      Screen.flash("#ff4040", 500);
      AudioMgr.seStack([
        { key: "spspImpact", volume: 0.68 },
        { key: "flash", volume: 0.25, delay: 90 },
      ], { duckFactor: 0.38, duckMs: 2100 });
      AudioMgr.voice("atsui");
      if (spspEvent && spspEvent.bg) {
        Screen.setBg(spspEvent.bg, false);
        await wait(900);
      }
      Screen.fxKira("kiraLine1", 2000);
      Screen.glowFlash("gold", 2400);   // SPSP発展：金点灯（激アツ）
      await Screen.reachTitle(spspEvent ? spspEvent.title : "激熱SPSP発展！！", 1800, "spsp");
      if (!spspEvent && sp.bg) Screen.setBg(sp.bg, false);
      await Screen.telop(
        (spspEvent && spspEvent.lines[0]) || sp.lines[0] || "運命の最終局面へ突入！",
        1500,
        "story hot"
      );
      if (S.mode === "normal") AudioMgr.se("kyuin3", 0.6);  // RUSH中は告知音を省略
      Screen.flash("#ffffff", 350);
      Screen.playVideo("cutinRed", { front: true, ms: 1000, opacity: 0.72 });
      await wait(900);
      if (sp.chars[0]) await Screen.cutin(sp.chars[0], "", 1300, "hot");
      await Screen.telop(
        (spspEvent && spspEvent.lines[1]) || sp.lines[sp.lines.length - 1] || "最後の一撃で決めろ！！",
        1400,
        "story hot"
      );
      const pressed = await Screen.pushButton(2800);
      if (pressed || true) {
        if (isWin) {
          const revival = Math.random() < 0.12;
          if (revival) {
            AudioMgr.se("fail", 0.32);
            Screen.flash("#303858", 450);
            await wait(650);
            AudioMgr.seStack([
              { key: "revivalJackpot", volume: 0.72 },
              { key: "pushSuccess", volume: 0.48, delay: 170 },
            ], { duckFactor: 0.24, duckMs: 3000 });
          } else {
            AudioMgr.seStack([
              { key: "pushSuccess", volume: 0.66 },
              { key: "symbolExplosion", volume: 0.42, delay: 100 },
            ], { duckFactor: 0.3, duckMs: 2200 });
          }
          Screen.fxKira("kiraLine2", 1800);
          Screen.glowFlash("red", 1800);   // 当り決着：赤点灯
          Screen.playVideo("gekiha", { front: true, ms: 2200 });  // 「撃破」動画
          Screen.flash("#ffd23f", 700);
          if (sp.chars[0]) await Screen.cutin(sp.chars[0], "決着──！！", 1600, "hot");
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
    Screen.reelsEventMode(false);
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
    // プレミア全回転（通常時のみjackpot BGMを先出し。RUSH中はRUSH時BGMを維持）
    if (S.mode === "normal") AudioMgr.playBgm("jackpot");
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
  async function playSet(setNo, totalSets, rounds, baseIdx, bonusArt = false) {
    // チャレンジ後のボーナス（2セット目）は専用一枚絵を持つキャラだけを回す
    // （専用絵の無いキャラでチャレンジ前の確定演出画像が出ないように）
    const bonusKeys = bonusArt ? Object.keys(BONUS_CHAR_IMGS) : null;
    for (let r = 1; r <= rounds; r++) {
      Screen.jackpotRound(totalSets > 1
        ? `${setNo}セット目 ROUND ${r} / ${rounds}`
        : `ROUND ${r} / ${rounds}`);
      const charKey = bonusArt
        ? bonusKeys[(baseIdx + r + setNo) % bonusKeys.length]
        : CHARACTERS[(baseIdx + r + setNo) % 8].key;
      Screen.jackpotChar(charKey, { bonus: bonusArt });
      roundCatch = 0;
      if (bonusArt && r === 1) {
        AudioMgr.seStack([
          { key: "secondBonus", volume: 0.58 },
          { key: "roundStart", volume: 0.24, delay: 180 },
        ], { duckFactor: 0.48, duckMs: 1700 });
      } else {
        AudioMgr.se("roundStart", 0.2);
      }
      setTimeout(() => AudioMgr.se("attackerOpen", 0.2), 110);
      Board.attackerOpen = true;
      const start = Date.now();
      while (roundCatch < SPEC.ROUND_CATCH && Date.now() - start < SPEC.ROUND_TIMEOUT_MS) {
        await wait(100);
      }
      Board.attackerOpen = false;
      AudioMgr.se("attackerClose", 0.18);
      await wait(650);
    }
  }

  // RUSH当落判定（10R終了時）。immediate=奇数図柄等で既に確定済みなら短くお祝いのみ
  async function rushChallengeBattle() {
    Screen.jackpotHide();
    Screen.reelsVisible(false);
    Screen.stopVideo();
    Screen.lcdMsg(null);
    Screen.setBg(SPSP_IMGS.kotan, false, false);
    AudioMgr.se("pseudo", 0.55);
    Screen.glowFlash("gold", 1800);
    await Screen.reachTitle(SPSP_REACH.title, 1600, "spsp");
    await Screen.telop(SPSP_REACH.lines[0], 1400, "story hot");
    Screen.flash("#ffffff", 300);
    Screen.playVideo("vs3d", { front: true, ms: 2200 });
    AudioMgr.se("kyuin3", 0.45);
    await wait(1900);
    Screen.setBg(SPSP_IMGS.ito, false, false);
    await Screen.telop(SPSP_REACH.lines[1], 1400, "story hot");
    await Screen.telop(SPSP_REACH.lines[2], 1400, "story hot");
    await Screen.pushButton(2400);
  }

  async function rushJudge(willRush, immediate, wasRush) {
    if (immediate) {
      if (!wasRush) {
        await rushChallengeBattle();
      }
      AudioMgr.se("rushCharge", 0.38);
      await wait(700);
      AudioMgr.seStack(wasRush ? [
        { key: "rushContinue", volume: 0.7 },
        { key: "rainbowFlash", volume: 0.3, delay: 120 },
      ] : [
        { key: "rushExplosion", volume: 0.72 },
        { key: "rushLogo", volume: 0.5, delay: 150 },
        { key: "rainbowFlash", volume: 0.28, delay: 250 },
      ], { duckFactor: 0.24, duckMs: 3000 });
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
    await rushChallengeBattle();
    Screen.lcdMsg(null);
    if (willRush) {
      AudioMgr.se("rushCharge", 0.4);
      await wait(800);
      AudioMgr.seStack(wasRush ? [
        { key: "rushContinue", volume: 0.72 },
        { key: "symbolExplosion", volume: 0.35, delay: 80 },
        { key: "rainbowFlash", volume: 0.3, delay: 180 },
      ] : [
        { key: "rushExplosion", volume: 0.74 },
        { key: "rushLogo", volume: 0.52, delay: 140 },
        { key: "rainbowFlash", volume: 0.3, delay: 250 },
      ], { duckFactor: 0.22, duckMs: 3200 });
      AudioMgr.voice("rush");
      Screen.yakumonoDrop();
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
  async function nextBonusReveal(charKey) {
    Screen.lcdMsg("継続なるか…！？", "alert");
    AudioMgr.se("drumroll", 0.5);
    Screen.glowFlash("gold", 2400);
    await wait(2400);
    Screen.lcdMsg(null);
    AudioMgr.seStack([
      { key: "nextBonusBreak", volume: 0.72 },
      { key: "bonus3000", volume: 0.62, delay: 120 },
      { key: "nextBonusStinger", volume: 0.3, delay: 320 },
    ], { duckFactor: 0.2, duckMs: 3800 });
    Screen.flash("#ffd23f", 800);
    Screen.glowFlash("rainbow", 2600);
    jackpotTarget = 2 * 10 * SPEC.ROUND_CATCH * SPEC.ATTACKER_PAY;
    Screen.jackpotShow("", charKey, { bonus: true });
    Screen.jackpotBalls(jackpotGained, jackpotTarget);
    await Screen.telop("NEXT BONUS！！ 10R×2 約3000個！", 2200, "story hot");
  }

  async function jackpotFlow(symbols, grade, showOdd, pattern) {
    S.inJackpot = true;
    S.rushInfoInJackpot = false;
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

    // 図柄ロック・低音爆発・確定音を重ね、7揃いとRUSH即当りは専用音を追加。
    AudioMgr.stopBgm();
    Screen.lyricsStop();
    const jackpotLayers = [
      { key: "symbolExplosion", volume: 0.72 },
      { key: "align", volume: 0.34, delay: 70 },
      { key: "kyuinBoost", volume: 0.26, delay: 150 },
    ];
    if (char.num === 7) jackpotLayers.push({ key: "sevenJackpot", volume: 0.72, delay: 110 });
    if (wasRush && pattern && pattern.type === "quick") {
      jackpotLayers.push({ key: "rushInstant", volume: 0.65, delay: 60 });
    }
    AudioMgr.seStack(jackpotLayers, { duck: false });
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
    const premiumImg = Math.random() < 0.01 ? PREMIUM_CONFIRM_IMG : null;
    if (premiumImg) {
      AudioMgr.seStack([
        { key: "premium1", volume: 0.72 },
        { key: "rainbowFlash", volume: 0.38, delay: 100 },
      ], { duckFactor: 0.24, duckMs: 2600 });
    }
    Screen.jackpotShow("", char.key, premiumImg ? { src: premiumImg } : {});
    updateModeUI(); // 右打ちランプ点灯
    $("migiuchi").classList.remove("hidden");
    await wait(1700);
    Screen.lcdMsg(null);
    await wait(1500);
    Screen.lcdMsg(null);

    if (wasRush && S.renchan === 10) {
      AudioMgr.seStack([
        { key: "renchan10", volume: 0.76 },
        { key: "rainbowFlash", volume: 0.34, delay: 180 },
      ], { duckFactor: 0.2, duckMs: 4200 });
    } else if (wasRush && [3, 5, 7].includes(S.renchan)) {
      AudioMgr.se("renchanUp", 0.52);
    }

    jackpotGained = 0;
    jackpotTarget = g.rounds * SPEC.ROUND_CATCH * SPEC.ATTACKER_PAY;

    // 1セット目のラウンド消化
    setJackpotRushInfo(rushResult);
    await playSet(1, g.sets, g.rounds, symbols[0]);
    setJackpotRushInfo(false);

    // ---- 前半（10R等）終了時の判定 ----
    if (grade === "double") {
      // まずRUSH当落 → ギリギリで継続(10R×2)告知 → 2セット目
      await rushJudge(true, judgeImmediate, wasRush);
      await nextBonusReveal(char.key);
      setJackpotRushInfo(true);
      await playSet(2, g.sets, g.rounds, symbols[0], true);
      setJackpotRushInfo(false);
    } else if (rushResult) {
      // single / mini：RUSH当落判定
      await rushJudge(true, judgeImmediate, wasRush);
    } else {
      // tanpatsu：転落（単発終了）
      await rushJudge(false, false, wasRush);
    }

    // 終了画面
    Screen.jackpotRound("");
    Screen.jackpotBalls(jackpotGained, jackpotTarget);
    await wait(600);
    if (!rushResult) await Screen.telop("左打ちに戻してください", 1600, "story");
    Screen.jackpotHide();

    // モード移行（リールは必ず表示に戻す）
    Screen.reelsVisible(true);
    S.mode = nextMode;
    S.modeLeft = rushResult ? SPEC.ST_COUNT : 0;
    S.inJackpot = false;
    S.rushInfoInJackpot = false;
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
    S.rushInfoInJackpot = false;
    updateModeUI();
    Screen.lyricsStop();
    AudioMgr.se("chime", 0.35);  // 放課後のチャイム
    AudioMgr.playBgm("sad");
    Screen.rushSplash("batsu", 2000);   // RUSH終了：×の大表示
    await Screen.telop("RUSH終了…… また明日から頑張ろう", 2200, "story");
    await wait(1000);
    // 通常時は教室ステージから再スタート
    S.stage = 0;
    S.stageSpins = 0;
    S.stageSpan = STAGE_SPAN();
    S.pendingChance = false;
    bgmForMode();
    restoreBg();
  }

  function restoreBg() {
    if (S.mode === "rush") Screen.setBg(BGS.cyber1);
    else Screen.setBg(STAGES[S.stage].bg);
  }

  /* ---------- 発射管理 ---------- */
  let launchTimer = null;
  function setHandle(strength) {
    if (strength > 0 && !launchTimer) {
      launchTimer = setInterval(() => {
        if (S.balls <= 0) return;
        updateBalls(-1);
        AudioMgr.se("ballLaunch", 0.08);
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
    { normal: 1 / 199.9, rush: 1 / 99.9, label: "1/199.9" },
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
