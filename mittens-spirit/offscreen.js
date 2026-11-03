// Tries these Stockfish files in order, so no editing needed.
const CANDIDATES = [
  "stockfish-19-lite-single.js",
  "stockfish-19-single.js",
  "stockfish.js"
];
const MOVE_TIME_MS = 1000;

let worker = null;
let pending = null;
let idx = 0;
let fatal = "";
let loaded = false;

function spawn() {
  if (idx >= CANDIDATES.length) {
    fatal = "Could not load any Stockfish file. Tried: " + CANDIDATES.join(", ") +
            ". Make sure the .js and .wasm are in the same folder as manifest.json.";
    console.error(fatal);
    if (pending) { pending({ error: fatal }); pending = null; }
    return;
  }
  const name = CANDIDATES[idx];
  console.log("[offscreen] starting", name);
  loaded = false;
  const w = new Worker(name);
  w.onerror = (e) => {
    console.warn("[offscreen] worker failed:", name, e.message || e);
    w.terminate();
    if (worker === w) worker = null;
    if (pending) { pending({ error: "worker failed: " + name + " " + (e.message || "") }); pending = null; }
    if (!loaded) idx++; // only try another file if this one never started
    spawn();
  };
  w.onmessage = (e) => {
    const line = typeof e.data === "string" ? e.data : "";
    if (line) console.log("[sf]", line);
    if (line === "uciok") loaded = true;
    if (line.startsWith("bestmove") && pending) {
      const move = line.split(" ")[1];
      pending({ move: move && move !== "(none)" ? move : null });
      pending = null;
    }
  };
  worker = w;
  w.postMessage("uci");
  w.postMessage("isready");
}
spawn();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  if (fatal) { sendResponse({ error: fatal }); return; }
  if (!worker) { sendResponse({ error: "engine still starting, try again" }); return; }
  if (pending) { worker.postMessage("stop"); }
  pending = sendResponse;
  worker.postMessage("position fen " + msg.fen);
  worker.postMessage("go movetime " + MOVE_TIME_MS);
  return true;
});
