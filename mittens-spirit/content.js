(() => {
  const DEBOUNCE_MS = 500;
  let timer = null, busy = false, dirty = false, lastFen = "", retries = 0;

  let enabled = true;
  try { enabled = localStorage.getItem("mittensEnabled") !== "0"; } catch (e) {}

  function buildBadge() {
    let b = document.getElementById("mittens-status");
    if (b) return b;
    b = document.createElement("div");
    b.id = "mittens-status";
    b.style.cssText = "position:fixed;bottom:10px;right:10px;z-index:99999;display:flex;align-items:center;gap:14px;padding:12px 20px;border-radius:10px;font:bold 20px monospace;color:#fff;background:#1b5e20;opacity:.95;pointer-events:none;";
    const text = document.createElement("span");
    text.id = "mittens-text";
    const sw = document.createElement("div");
    sw.id = "mittens-switch";
    sw.title = "Turn on/off";
    sw.style.cssText = "position:relative;width:52px;height:28px;border-radius:14px;cursor:pointer;pointer-events:auto;flex:none;transition:background .15s;";
    const knob = document.createElement("div");
    knob.id = "mittens-knob";
    knob.style.cssText = "position:absolute;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .15s;";
    sw.appendChild(knob);
    sw.addEventListener("click", toggle);
    b.append(text, sw);
    document.body.appendChild(b);
    return b;
  }

  function setStatus(text, bad) {
    const b = buildBadge();
    b.querySelector("#mittens-text").textContent = "M1TTENS SP1R1T: " + (enabled ? text : "OFF");
    b.style.background = !enabled ? "#424242" : bad ? "#b71c1c" : "#1b5e20";
    b.querySelector("#mittens-switch").style.background = enabled ? "#00e676" : "#757575";
    b.querySelector("#mittens-knob").style.left = enabled ? "27px" : "3px";
    console.log("[Mittens Arrow]", text);
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem("mittensEnabled", enabled ? "1" : "0"); } catch (e) {}
    if (!enabled) { clearArrow(); setStatus("off"); }
    else { lastFen = ""; setStatus("on"); schedule(); }
  }

  const BOARD_SELECTORS = ["wc-chess-board", "chess-board", "#board-single", "#board-play-computer", "#board-layout-chessboard", ".board"];

  function collectPieces(board) {
    const roots = [board, board.shadowRoot].filter(Boolean);
    for (const r of roots) {
      const found = r.querySelectorAll(".piece");
      if (found.length) return [...found];
    }
    return [];
  }

  function getBoard() {
    let fallback = null;
    for (const sel of BOARD_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (!fallback) fallback = el;
        if (collectPieces(el).length) return el;
      }
    }
    return fallback;
  }

  function dumpBoard(board) {
    console.log("[Mittens Arrow] DUMP tag=" + board.tagName + " id=" + board.id + " class=" + board.className +
      " shadow=" + !!board.shadowRoot + " pieces=" + collectPieces(board).length);
    console.log("[Mittens Arrow] DUMP html:", (board.shadowRoot ? board.shadowRoot.innerHTML : board.outerHTML).slice(0, 1500));
  }

  function readPosition(board) {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null)); // [rank-1][file-1]
    collectPieces(board).forEach((p) => {
      const cls = [...p.classList];
      const sq = cls.find((c) => /^square-\d\d$/.test(c));
      const t = cls.find((c) => /^[wb][pnbrqk]$/.test(c));
      if (!sq || !t) return;
      const file = +sq[7], rank = +sq[8];
      grid[rank - 1][file - 1] = t[0] === "w" ? t[1].toUpperCase() : t[1];
    });

    let wk = 0, bk = 0, count = 0;
    grid.forEach((row) => row.forEach((p) => { if (p) count++; if (p === "K") wk++; if (p === "k") bk++; }));
    if (wk !== 1 || bk !== 1) {
      return { ourTurn: false, error: "can't read board (found " + count + " pieces, " + wk + " white king, " + bk + " black king)" };
    }

    const us = board.classList.contains("flipped") ? "b" : "w";

    // who moved last? look at the highlighted squares
    let mover = null;
    board.querySelectorAll(".highlight").forEach((h) => {
      const sq = [...h.classList].find((c) => /^square-\d\d$/.test(c));
      if (!sq) return;
      const piece = grid[+sq[8] - 1][+sq[7] - 1];
      if (piece) mover = piece === piece.toUpperCase() ? "w" : "b";
    });
    const ourTurn = mover ? mover !== us : us === "w";
    if (!ourTurn) return { ourTurn: false };

    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = "", empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = grid[r][f];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      if (empty) row += empty;
      rows.push(row);
    }

    let castle = "";
    if (grid[0][4] === "K" && grid[0][7] === "R") castle += "K";
    if (grid[0][4] === "K" && grid[0][0] === "R") castle += "Q";
    if (grid[7][4] === "k" && grid[7][7] === "r") castle += "k";
    if (grid[7][4] === "k" && grid[7][0] === "r") castle += "q";

    return { ourTurn: true, us, fen: `${rows.join("/")} ${us} ${castle || "-"} - 0 1` };
  }

  function clearArrow() {
    document.getElementById("mittens-arrow")?.remove();
  }

  function drawArrow(board, uci, us) {
    clearArrow();
    if (!uci || uci.length < 4) return;
    const pt = (sq) => {
      const f = sq.charCodeAt(0) - 96, r = +sq[1];
      return us === "w" ? [f - 0.5, 8 - r + 0.5] : [8 - f + 0.5, r - 0.5];
    };
    const [x1, y1] = pt(uci.slice(0, 2));
    const [x2, y2] = pt(uci.slice(2, 4));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ex = x2 - ((x2 - x1) / len) * 0.35;
    const ey = y2 - ((y2 - y1) / len) * 0.35;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.id = "mittens-arrow";
    svg.setAttribute("viewBox", "0 0 8 8");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    svg.innerHTML = `
      <defs><marker id="mittens-head" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
        <path d="M0,0 L3,1.5 L0,3 z" fill="#00e676"/></marker></defs>
      <circle cx="${x1}" cy="${y1}" r="0.18" fill="#00e676" fill-opacity="0.85"/>
      <line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="#00e676" stroke-opacity="0.85"
            stroke-width="0.2" stroke-linecap="round" marker-end="url(#mittens-head)"/>`;
    board.appendChild(svg);
  }

  async function update() {
    if (!enabled) { clearArrow(); setStatus("off"); return; }
    if (busy) { dirty = true; return; }
    const board = getBoard();
    if (!board) { setStatus("no board found", true); return; }
    const pos = readPosition(board);
    if (pos.error) { setStatus(pos.error, true); dumpBoard(board); return; }
    if (!pos.ourTurn) { clearArrow(); lastFen = ""; setStatus("waiting for opponent"); return; }
    if (pos.fen === lastFen) { if (!document.getElementById("mittens-arrow")) {} else return; }
    lastFen = pos.fen;
    busy = true;
    setStatus("thinking...");
    try {
      const res = await chrome.runtime.sendMessage({ type: "analyze", fen: pos.fen });
      // make sure the position didn't change while thinking
      const now = readPosition(board);
      if (!enabled) { clearArrow(); }
      else if (res?.error || !res) {
        setStatus("engine error: " + (res?.error || "no reply"), true);
        lastFen = "";
        if (retries++ < 5) setTimeout(schedule, 3000);
      }
      else if (now.ourTurn && now.fen === pos.fen && res.move) { retries = 0; drawArrow(board, res.move, pos.us); setStatus("best move " + res.move); }
      else setStatus("position changed, retrying");
    } catch (e) {
      setStatus("error: " + e.message, true);
    }
    busy = false;
    if (dirty) { dirty = false; schedule(); }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, DEBOUNCE_MS);
  }

  function start() {
    const board = getBoard();
    setStatus(board ? "loaded, board found" : "loaded, looking for board...", !board);
    if (!board) return setTimeout(start, 1000);
    new MutationObserver(schedule).observe(board, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["class"]
    });
    schedule();
  }
  start();
})();
