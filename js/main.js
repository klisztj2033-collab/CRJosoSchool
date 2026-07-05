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

  /* スタート（オーディオ解禁） */
  $("start-btn").addEventListener("click", () => {
    $("start-overlay").classList.add("hidden");
    AudioMgr.playBgm("normal");
    // 遊技開始時に自動で打ち始める（左打ち45）
    handle.value = 45;
    applyHandle();
  });

  /* 発光差分画像のプリロード（色切り替え時のチラつき防止） */
  for (const n of ["glow_red", "glow_blue", "glow_gold", "glow_rainbow"]) {
    const img = new Image();
    img.src = `imagin/${n}.png`;
  }

  /* 初期化 */
  Machine.init();
  Board.tick();
})();
