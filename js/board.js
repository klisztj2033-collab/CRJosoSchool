/* =========================================================
 * 盤面（Canvas物理演算：釘・玉・ヘソ・電チュー・アタッカー）
 * 座標系は筐体画像（1085x1450）に1:1対応。
 * 釘は筐体アートから自動検出した PEG_DATA（js/pegs_data.js）を使用し、
 * 玉が筐体の絵の釘の間を通るように見せる。
 * ======================================================= */
const Board = (() => {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;   // 1085 x 1450

  // ガラス窓の境界（角丸四角＝スーパー楕円 |u|^n + |v|^n = 1）
  const WIN = { cx: 545, cy: 690, rx: 478, ry: 483, n: 3 };

  // 液晶の透過穴は輪郭線分（HOLE_EDGE）で判定し、玉は境界線まで動ける
  // 中央役物（中エンブレムの盾。玉は通れない。下端はヘソへの通路を確保）
  const YAKU = { x: 452, y: 798, w: 192, h: 126 };
  const SOLIDS = [YAKU];

  // 入賞口
  // ヘソ＝役物下部・赤ランプ中央の穴（アートの位置に一致）
  const HESO   = { x: 548, y: 1060, r: 16 };
  const DENCHU = { x: 975, y: 830, r: 16 };
  const ATTACKER = { x: 800, y: 1100, w: 80, h: 16 };

  const BALL_R = 7;
  const GRAVITY = 0.19;
  const REST = 0.34;   // 鋼球らしく低反発（跳ねすぎ＝ぷよぷよ感を解消）

  let balls = [];
  let denchuOpen = false;
  let attackerOpen = false;

  // 玉スプライト（球体部分: x244-424, y92-272）
  const ballSprite = new Image();
  ballSprite.src = "imagin/玉.png";

  // コールバック（machine.jsが設定）
  const handlers = { onHeso: null, onDenchu: null, onAttacker: null, onOut: null };

  /* ---------- 釘・レール ---------- */
  // 筐体アートから検出した釘（当たり判定のみ。描画はアートに任せる）
  // ほぼ重なる検出点だけ間引く。近接ペアは実機同様「通れない釘」として残し、
  // 見えている釘を玉がすり抜ける「あいまいな当たり判定」を防ぐ
  // 左下の道釘・寄り釘ゾーン：ヘソへ玉を運ぶ見えるビーズ釘の列。
  // ここは一切間引かず最低半径も底上げして、列の上を確実に転がす
  const MICHI_ZONE = (x, y) => x >= 150 && x <= 470 && y >= 820 && y <= 1090;
  // 釘ではない装飾の誤検出（役物縁のキラ・盾の縁と重なるビーズ）。
  // 役物壁との間に玉が挟まる袋小路を作るため判定から外す
  const PEG_EXCLUDE = [[425, 933], [443, 974], [449, 969], [432, 993], [441, 999],
                       [650, 1035]];  // 右・道レール面から突き出て玉を堰き止めるビーズ
  const pegs = [];
  for (const p of PEG_DATA) {
    if (PEG_EXCLUDE.some(e => Math.abs(e[0] - p[0]) < 4 && Math.abs(e[1] - p[1]) < 4)) continue;
    if (MICHI_ZONE(p[0], p[1])) {
      pegs.push({ x: p[0], y: p[1], r: Math.max(3.2, Math.min(p[2], 5.5)) });
      continue;
    }
    // 右打ちルートの装飾ビーズ密集地帯は広めに間引いて通り抜けを確保
    // （17pxだと玉径より狭い壁ができて停滞する）
    const dd = (p[0] >= 845 && p[0] <= 1015 && p[1] >= 810 && p[1] <= 930) ? 25 : 17;
    let tooClose = false;
    for (const q of pegs) {
      const dx = p[0] - q.x, dy = p[1] - q.y;
      if (dx * dx + dy * dy < dd * dd) { tooClose = true; break; }
    }
    if (!tooClose) pegs.push({ x: p[0], y: p[1], r: Math.min(p[2], 5.5) });
  }
  const rails = [];
  function addPeg(x, y, r = 4) { pegs.push({ x, y, r, extra: true }); }
  function addPegIfSparse(x, y, r = 3.2, minGap = 7) {
    for (const p of pegs) {
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy < minGap * minGap) return;
    }
    addPeg(x, y, r);
  }
  function addRail(x1, y1, x2, y2) { rails.push({ x1, y1, x2, y2 }); }

  // へそ上部の見えている釘。自動間引き・除外で弱くなった部分だけ小さめに戻す。
  const HESO_UPPER_PEGS = [
    [425, 933, 3.3], [449, 969, 3.2], [443, 974, 3.2],
    [432, 993, 3.3], [441, 999, 3.2],
    [460, 1008, 3.0], [452, 1015, 3.0], [480, 1020, 3.0], [515, 1064, 3.0],
    [709, 968, 3.1], [670, 994, 3.2], [652, 1004, 3.2], [650, 1035, 3.2],
  ];
  for (const p of HESO_UPPER_PEGS) addPegIfSparse(p[0], p[1], p[2]);

  // 道釘：左は見えるビーズ釘の列（MICHI_ZONE）が玉を運ぶ。
  // レールはビーズ列の中心線上に敷き、釘間のV溝を橋渡しして
  // なめらかに転がす（釘の無い空間には判定を置かない）
  // ※レールはビーズ列の頭頂線に合わせる：玉が「見えている釘の列の上」を
  //   なめらかに転がる。二列ビーズの内側は玉径より狭く通れないため、
  //   入口を接続レールで塞いで上段列の上を通す
  addRail(216, 823, 245, 876);              // 寄り釘・急斜面の列
  addRail(245, 876, 296, 914);              // 急斜面→道釘列への接続（樋の入口を塞ぐ）
  addRail(296, 914, 430, 992);              // 道釘・上段列の頭頂線（メインルート）
  addRail(312, 1000, 384, 1008);            // 道釘・下段平坦部（跳ねた玉の受け）
  addRail(384, 1008, 402, 1014);            // 道釘・下りへの継ぎ目
  addRail(402, 1014, 444, 1045);            // 道釘・下り部の列
  addRail(470, 1046, HESO.x - 12, 1069);    // 左・ヘソ前レール（手前にこぼしギャップ）
  // Left acrylic guard: prevents balls from slipping through the clear decorative chute.
  const LEFT_CLEAR_GUARD = [
    [132, 462, 124, 620],
    [124, 620, 126, 760],
    [126, 760, 146, 880],
    [146, 880, 190, 990],
    [190, 990, 266, 1090],
  ];
  for (const s of LEFT_CLEAR_GUARD) addRail(s[0], s[1], s[2], s[3]);
  addRail(916, 985, 696, 1018);             // 右・寄りレール
  addRail(696, 1018, 641, 1048);            // 右・道レール（終端で玉が止まらないよう傾斜強め）
  addRail(604, 1060, HESO.x + 12, 1069);    // 右・ヘソ前レール（手前にギャップ）
  // ※ヘソへは道レール経由でのみ到達（真上は役物が塞ぐ）ため命釘は無し。
  //   入賞率はこぼしギャップの幅で調整する。

  // 液晶透過穴の輪郭（玉は境界線まで動き、縁に沿って転がる）
  // へそ上部の釘列へ入る下側だけはアート上の飾りなので判定を外す。
  function isHesoApproachEdge(s) {
    const minX = Math.min(s[0], s[2]), maxX = Math.max(s[0], s[2]);
    const minY = Math.min(s[1], s[3]);
    return minY >= 900 && maxX >= 410 && minX <= 665;
  }
  for (const s of HOLE_EDGE) {
    if (isHesoApproachEdge(s)) continue;
    addRail(s[0], s[1], s[2], s[3]);
  }

  /* ---------- 発射 ---------- */
  // strength: 0-100（75以上で右打ちルート）
  function launch(strength) {
    if (strength >= 75) {
      // 右打ち：「右打ち」プレート下のレーンへ投入
      balls.push({
        x: 940 + Math.random() * 40,
        y: 700,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.6 + Math.random() * 0.4,
        dead: false,
      });
    } else {
      // 左打ち：左チャンネル（窓の左縁と液晶の間）へ投入。
      // 玉は左フィールドを釘に絡んで落ち、下中央のヘソへ向かう
      const t = strength / 75;
      let x = 185 + t * 45 + (Math.random() - 0.5) * 30;
      x = Math.max(168, Math.min(245, x));
      balls.push({ x, y: 330, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.5, dead: false });
    }
  }

  /* ---------- 物理更新 ---------- */
  function step() {
    for (const b of balls) {
      if (b.dead) continue;
      b.vy += GRAVITY;
      // 終端速度キャップ（玉半径未満に抑えて釘・レール・液晶のすり抜けを防止）
      const vmag = Math.hypot(b.vx, b.vy);
      if (vmag > 6.5) { b.vx *= 6.5 / vmag; b.vy *= 6.5 / vmag; }
      b.x += b.vx;
      b.y += b.vy;

      // ガラス窓の境界（スーパー楕円）
      {
        const rxE = WIN.rx - BALL_R, ryE = WIN.ry - BALL_R, n = WIN.n;
        const u = (b.x - WIN.cx) / rxE, v = (b.y - WIN.cy) / ryE;
        const f = Math.pow(Math.abs(u), n) + Math.pow(Math.abs(v), n);
        if (f > 1) {
          // 境界内へ半径方向に押し戻し
          const scale = Math.pow(f, -1 / n);
          b.x = WIN.cx + (b.x - WIN.cx) * scale;
          b.y = WIN.cy + (b.y - WIN.cy) * scale;
          // 法線 = 勾配ベクトル
          const uu = (b.x - WIN.cx) / rxE, vv = (b.y - WIN.cy) / ryE;
          let nx = Math.pow(Math.abs(uu), n - 1) * Math.sign(uu) / rxE;
          let ny = Math.pow(Math.abs(vv), n - 1) * Math.sign(vv) / ryE;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl; ny /= nl;
          const dot = b.vx * nx + b.vy * ny;
          if (dot > 0) {
            b.vx = (b.vx - 2 * dot * nx) * (REST + 0.12);
            b.vy = (b.vy - 2 * dot * ny) * (REST + 0.12);
          }
        }
      }

      // 液晶穴・役物との衝突
      for (const s of SOLIDS) collideRect(b, s);

      // レール衝突（転がして誘導）
      for (const rl of rails) {
        const dx = rl.x2 - rl.x1, dy = rl.y2 - rl.y1;
        const len2 = dx * dx + dy * dy;
        let t = ((b.x - rl.x1) * dx + (b.y - rl.y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = rl.x1 + t * dx, cy = rl.y1 + t * dy;
        const ddx = b.x - cx, ddy = b.y - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < BALL_R * BALL_R && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = ddx / d, ny = ddy / d;
          b.x = cx + nx * BALL_R;
          b.y = cy + ny * BALL_R;
          // 法線成分のみ減衰、接線成分（転がり）はほぼ保存
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            const tx = b.vx - dot * nx, ty = b.vy - dot * ny;
            b.vx = tx * 0.995 - nx * dot * 0.35;
            b.vy = ty * 0.995 - ny * dot * 0.35;
          }
        }
      }

      // 釘衝突（筐体アートの釘）※ゴースト玉は釘をすり抜ける
      if (!b.ghost)
      for (const p of pegs) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const rr = BALL_R + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          b.x = p.x + nx * rr;
          b.y = p.y + ny * rr;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            // 法線成分は大きく減衰（低反発）、接線成分は転がりとして保持
            const tx = b.vx - dot * nx, ty = b.vy - dot * ny;
            b.vx = tx * 0.97 - nx * dot * REST + (Math.random() - 0.5) * 0.3;
            b.vy = ty * 0.97 - ny * dot * REST;
          }
        }
      }

      // アンチスタック：一定時間ほぼ同じ場所に留まる玉を揺すって落とす
      // （キックは回数ごとに強化し、それでも抜けない玉はこぼれ玉として排出）
      if (b.px === undefined) { b.px = b.x; b.py = b.y; b.still = 0; b.kicks = 0; }
      b.still++;
      if (b.still >= 80) {
        const moved = Math.hypot(b.x - b.px, b.y - b.py);
        if (moved < 8) {
          b.kicks++;
          kickCount++;
          if (kickPosArr) kickPosArr.push([Math.round(b.x), Math.round(b.y)]);
          if (b.kicks > 5) {
            // どうしても抜けない玉は釘をすり抜けて落下（ゴースト化）
            b.ghost = true;
          }
          b.vx += (Math.random() - 0.5) * (2.6 + b.kicks * 0.6);
          b.vy -= 0.8 + Math.random() * 0.8 + b.kicks * 0.3;
        } else {
          b.kicks = 0;
        }
        b.px = b.x; b.py = b.y; b.still = 0;
      }

      // ---- 入賞判定 ----
      // ヘソ（始動口）
      if (b.vy > 0 && Math.abs(b.x - HESO.x) < HESO.r - 5 && Math.abs(b.y - HESO.y) < 16) {
        b.dead = true;
        handlers.onHeso && handlers.onHeso();
        continue;
      }
      // 電チュー（開放中のみ）
      if (denchuOpen && b.vy > 0 && Math.abs(b.x - DENCHU.x) < DENCHU.r + 5 && Math.abs(b.y - DENCHU.y) < 14) {
        b.dead = true;
        handlers.onDenchu && handlers.onDenchu();
        continue;
      }
      // アタッカー（開放中のみ）
      if (attackerOpen && b.vy > 0 &&
          b.x > ATTACKER.x && b.x < ATTACKER.x + ATTACKER.w &&
          Math.abs(b.y - ATTACKER.y) < 14) {
        b.dead = true;
        handlers.onAttacker && handlers.onAttacker();
        continue;
      }
      // アウト（アタッカーより下はすべてアウト）
      if (b.y > 1118) {
        b.dead = true;
        handlers.onOut && handlers.onOut();
      }

      // 調整用トレース（y1035通過時のx分布）
      if (traceArr && !b._traced && b.y > 1035) { b._traced = true; traceArr.push(Math.round(b.x)); }
    }
    balls = balls.filter(b => !b.dead);
    if (balls.length > 150) balls.splice(0, balls.length - 150);
  }

  function collideRect(b, r) {
    const cx = Math.max(r.x, Math.min(b.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(b.y, r.y + r.h));
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < BALL_R * BALL_R) {
      if (d2 < 0.0001) { b.y = r.y - BALL_R; b.vy = -Math.abs(b.vy) * REST; return; }
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      b.x = cx + nx * BALL_R;
      b.y = cy + ny * BALL_R;
      const dot = b.vx * nx + b.vy * ny;
      b.vx = (b.vx - 2 * dot * nx) * REST;
      b.vy = (b.vy - 2 * dot * ny) * REST;
      // 上面接触時は屋根状に転がす（平らな棚に玉が溜まらないように）
      if (ny < -0.7) {
        b.vx += ((b.x - (r.x + r.w / 2)) / r.w) * 1.4 + (Math.random() - 0.5) * 0.4;
      }
    }
  }

  /* ---------- 描画（筐体アートの上に玉と入賞口の状態だけを重ねる） ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ヘソ（始動口の受け）
    ctx.beginPath();
    ctx.arc(HESO.x, HESO.y, HESO.r, Math.PI, 0, true);
    ctx.fillStyle = "rgba(255, 210, 63, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "#fff3c0";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 電チュー
    ctx.beginPath();
    ctx.arc(DENCHU.x, DENCHU.y, DENCHU.r, 0, Math.PI * 2);
    ctx.fillStyle = denchuOpen ? "rgba(63, 224, 106, 0.85)" : "rgba(30, 34, 50, 0.6)";
    ctx.fill();
    ctx.strokeStyle = denchuOpen ? "#c8ffdd" : "#565e7a";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // アタッカー
    ctx.fillStyle = attackerOpen ? "rgba(255, 64, 64, 0.9)" : "rgba(30, 34, 50, 0.6)";
    roundRect(ATTACKER.x, ATTACKER.y - 9, ATTACKER.w, ATTACKER.h + 2, 6);
    ctx.fill();
    if (attackerOpen) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 3;
      roundRect(ATTACKER.x - 5, ATTACKER.y - 13, ATTACKER.w + 10, ATTACKER.h + 10, 7);
      ctx.stroke();
    }

    // 玉（スプライト使用・未ロード時はグラデ描画）
    for (const b of balls) {
      if (ballSprite.complete && ballSprite.naturalWidth > 0) {
        const d = BALL_R * 2.3;
        ctx.drawImage(ballSprite, 244, 92, 181, 181, b.x - d / 2, b.y - d / 2, d, d);
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, "#8a94b8");
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- ループ（実時間ベース・バックグラウンドでも物理継続） ---------- */
  const STEP_MS = 1000 / 60;
  let lastT = performance.now();

  function advance() {
    const now = performance.now();
    let steps = Math.floor((now - lastT) / STEP_MS);
    if (steps <= 0) return;
    if (steps > 30) { steps = 30; lastT = now - steps * STEP_MS; }
    for (let i = 0; i < steps; i++) step();
    lastT += steps * STEP_MS;
  }

  function tick() {
    advance();
    draw();
    requestAnimationFrame(tick);
  }
  setInterval(advance, 100);

  /* ---------- 釘調整用ヘッドレスシミュレーション ---------- */
  let traceArr = null;
  let kickPosArr = null;
  let kickCount = 0;   // アンチスタックのキック回数（停滞の指標）
  function simulate(count, strength, opts = {}) {
    traceArr = opts.trace ? [] : null;
    kickPosArr = opts.trace ? [] : null;
    kickCount = 0;
    const savedBalls = balls;
    const savedHandlers = { ...handlers };
    const savedDenchu = denchuOpen, savedAttacker = attackerOpen;
    denchuOpen = !!opts.denchu;
    attackerOpen = !!opts.attacker;
    let heso = 0, out = 0, denchu = 0, att = 0;
    balls = [];
    handlers.onHeso = () => heso++;
    handlers.onDenchu = () => denchu++;
    handlers.onAttacker = () => att++;
    handlers.onOut = () => out++;
    for (let i = 0; i < count; i++) {
      launch(strength);
      for (let s = 0; s < 36; s++) step();
    }
    let guard = 60 * 120;
    while (balls.length > 0 && guard-- > 0) step();
    const res = { count, heso, denchu, att, out, stuck: balls.length,
                  kicks: kickCount,
                  hesoRate: +(heso / count * 100).toFixed(1) };
    if (traceArr) { res.trace = traceArr; traceArr = null; }
    if (kickPosArr) { res.kickPos = kickPosArr; kickPosArr = null; }
    balls = savedBalls;
    Object.assign(handlers, savedHandlers);
    denchuOpen = savedDenchu;
    attackerOpen = savedAttacker;
    return res;
  }

  return {
    launch, tick, handlers, simulate,
    set denchuOpen(v) { denchuOpen = v; },
    set attackerOpen(v) { attackerOpen = v; },
  };
})();
