/* =========================================================
 * 起動・UIバインド
 * ======================================================= */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ハンドル操作 */
  const handle = $("handle");
  const fill = $("handle-fill");
  const marker = $("handle-marker");

  function applyHandle() {
    const v = Number(handle.value);
    fill.style.width = v + "%";
    marker.style.left = `calc(${v}% - 6px)`;
    fill.classList.toggle("strong", v >= 75);
    Machine.updateStrength(v);
  }
  handle.addEventListener("input", applyHandle);

  // キーボード操作（←→で微調整、スペースで右打ち⇔左打ち切替）
  document.addEventListener("keydown", (e) => {
    if (e.code === "ArrowRight") { handle.value = Math.min(100, Number(handle.value) + 5); applyHandle(); }
    if (e.code === "ArrowLeft")  { handle.value = Math.max(0, Number(handle.value) - 5); applyHandle(); }
    if (e.code === "Space") {
      e.preventDefault();
      handle.value = Number(handle.value) >= 75 ? 45 : 90;
      applyHandle();
    }
  });

  /* 玉貸 */
  $("lend-btn").addEventListener("click", () => {
    Machine.updateBalls(SPEC.LEND_BALLS);
    AudioMgr.se("button", 0.4);
  });

  /* スペック説明 */
  $("spec-btn").addEventListener("click", () => $("spec-modal").classList.remove("hidden"));
  $("spec-close").addEventListener("click", () => $("spec-modal").classList.add("hidden"));

  /* サウンドON/OFF */
  $("sound-btn").addEventListener("click", () => {
    const on = AudioMgr.toggle();
    $("sound-btn").textContent = on ? "♪ ON" : "♪ OFF";
  });

  /* テストプレイ用ボタン */
  $("test-hit").addEventListener("click", () => { Machine.testHit(); });
  $("test-rush").addEventListener("click", () => { Machine.testRush(); });
  $("test-prob").addEventListener("click", () => {
    const label = Machine.cycleProb();
    $("test-prob").textContent = "確率 " + label;
  });

  /* スタート（オーディオ解禁） */
  $("start-btn").addEventListener("click", () => {
    $("start-overlay").classList.add("hidden");
    AudioMgr.playBgm("normal");
    // 遊技開始時に自動で打ち始める（左打ち45）
    handle.value = 45;
    applyHandle();
  });

  /* 発光差分・演出画像のプリロード（切り替え時のチラつき防止） */
  for (const n of ["glow_red", "glow_blue", "glow_gold", "glow_rainbow"]) {
    const img = new Image();
    img.src = `imagin/${n}.png`;
  }
  const preloadList = [
    CONFIRM_BG,
    "imagin/口論バトル 石川VS西山.png", "imagin/常磐線 遅延ダッシュ.png",
    "imagin/体育祭 大声援リレー.png", "imagin/ちのね_ラブレター.png",
    ...Object.values(TEXT_IMGS),
    ...Object.values(SPSP_IMGS),
    ...Object.values(CONFIRM_CHAR_IMGS),
  ];
  for (const p of preloadList) {
    const img = new Image();
    img.src = encodeURI(p);
  }

  /* 初期化 */
  Machine.init();
  Board.tick();
})();
