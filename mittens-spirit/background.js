async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run the Stockfish engine in a Web Worker"
  });
  // give the engine a moment to start the first time
  await new Promise((r) => setTimeout(r, 1500));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "analyze") return;
  (async () => {
    try {
      await ensureOffscreen();
      const res = await Promise.race([
        chrome.runtime.sendMessage({ target: "offscreen", fen: msg.fen }),
        new Promise((r) => setTimeout(() => r({ error: "engine timed out (10s)" }), 10000))
      ]);
      sendResponse(res || { error: "empty reply from offscreen page" });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  })();
  return true;
});
