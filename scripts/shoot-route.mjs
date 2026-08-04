#!/usr/bin/env node

/**
 * DETERMINISTIC ROUTE SHOTS.
 *
 * Screenshots the real route at fixed semantic scroll positions so every code
 * change produces a comparable image instead of a hand-driven browser session.
 *
 * Determinism comes from freezing the page clock: `performance.now()` and
 * `requestAnimationFrame` are replaced before any app script runs, so the
 * engine only advances when this script steps it. A shot is therefore a pure
 * function of (chapter, localProgress, frame count) — the same commit always
 * renders the same pixels.
 *
 *   node scripts/shoot-route.mjs --baseline    # remember the current look
 *   ...make a change...
 *   node scripts/shoot-route.mjs               # shoot again + diff vs baseline
 *
 * Needs `npm run dev` running. See --help for flags.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";

/**
 * The scroll spine. Each shot is a chapter plus a local progress inside it,
 * the same address the director uses — so shots survive content edits that
 * would break raw pixel offsets.
 */
const SHOTS = [
  { name: "01-hero-open", chapter: "hero", localProgress: 0 },
  { name: "02-hero-settled", chapter: "hero", localProgress: 0.55 },
  { name: "03-principle", chapter: "principle", localProgress: 0.5 },
  { name: "04-capabilities-first", chapter: "capabilities", localProgress: 0.25 },
  { name: "05-capabilities-last", chapter: "capabilities", localProgress: 0.7 },
  { name: "06-lenox-enter", chapter: "lenox", localProgress: 0.3 },
  { name: "07-lenox-hold", chapter: "lenox", localProgress: 0.75 },
  { name: "08-contact", chapter: "contact", localProgress: 0.4 },
];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (has("--help") || has("-h")) {
  process.stdout.write(
    `shoot-route — deterministic screenshots of the real route\n\n` +
      `  --baseline          write baseline/ instead of comparing against it\n` +
      `  --shots a,b         only these shots (default: all ${SHOTS.length})\n` +
      `  --chapter hero      only shots of one chapter\n` +
      `  --design design-01  design id to pin (default: design-01)\n` +
      `  --viewport 1280x720 viewport size\n` +
      `  --frames 60         frames stepped after each scroll (default 60)\n` +
      `  --warmup 150        frames stepped after load (default 150)\n` +
      `  --live              real clock instead of the frozen one\n` +
      `  --visible           headed Chrome\n` +
      `  --url <base>        default http://127.0.0.1:3000\n\n` +
      `Shots: ${SHOTS.map((shot) => shot.name).join(", ")}\n`,
  );
  process.exit(0);
}

const baseUrl = value("--url", process.env.SHOOT_BASE_URL ?? "http://127.0.0.1:3000");
const design = value("--design", "design-01");
const [width, height] = value("--viewport", "1280x720").split("x").map(Number);
const frames = Number(value("--frames", "60"));
/**
 * GPU float noise in the particle sim leaves ~0.1% of pixels wobbling between
 * two identical runs. 0.25% clears that with headroom and still catches a
 * change as small as the header logo resizing.
 */
const threshold = Number(value("--threshold", "0.25"));
const warmup = Number(value("--warmup", "150"));
const live = has("--live");
const isBaseline = has("--baseline");
const outputRoot = resolve(process.env.SHOOT_OUTPUT_DIR ?? "output/route-shots");
const outputDir = resolve(outputRoot, isBaseline ? "baseline" : "current");
const baselineDir = resolve(outputRoot, "baseline");
const diffDir = resolve(outputRoot, "diff");
const chromePath =
  process.env.SHOOT_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const only = value("--shots", null)?.split(",").map((name) => name.trim());
const chapterFilter = value("--chapter", null);
const shots = SHOTS.filter(
  (shot) =>
    (!only || only.includes(shot.name)) &&
    (!chapterFilter || shot.chapter === chapterFilter),
);

if (!Number.isFinite(width) || !Number.isFinite(height)) {
  throw new Error("--viewport must look like 1280x720");
}
if (!shots.length) throw new Error("No shots selected");
if (!existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);

try {
  const probe = await fetch(baseUrl, { method: "HEAD" });
  if (!probe.ok && probe.status >= 500) throw new Error(String(probe.status));
} catch {
  throw new Error(`Dev server not reachable at ${baseUrl}. Start it with: npm run dev`);
}

await mkdir(outputDir, { recursive: true });
if (!isBaseline) await mkdir(diffDir, { recursive: true });

/**
 * Replaces the page clock before any app script runs. Everything that animates
 * — the engine's THREE.Clock, GSAP's ticker, ScrollTrigger — reads through
 * these, so nothing moves except when __shot.step() says so.
 */
const FREEZE_CLOCK = `(() => {
  let now = 0;
  const FRAME = 1000 / 60;
  const queued = new Map();
  let nextId = 1;

  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => now,
  });
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    queued.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => queued.delete(id);

  const idle = () => new Promise((done) => setTimeout(done, 0));

  window.__shot = {
    frozen: true,
    now: () => now,
    /**
     * The engine's frame is async (it awaits GPU submission before asking for
     * the next frame), so a frame is not done when its callback returns — it
     * is done when something has queued the next one. We wait for that.
     */
    async step(count) {
      for (let i = 0; i < count; i += 1) {
        now += FRAME;
        const due = [...queued.values()];
        queued.clear();
        for (const callback of due) {
          try {
            callback(now);
          } catch {}
        }
        await idle();
        let guard = 0;
        while (queued.size === 0 && guard < 120) {
          await idle();
          guard += 1;
        }
      }
      return now;
    },
  };
})()`;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      reject(new Error("Could not reserve a debugging port"));
      return;
    }
    const selected = address.port;
    server.close(() => resolvePort(selected));
  });
});

const profileDir = await mkdtemp(resolve(tmpdir(), "route-shots-"));
const chromeArgs = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--enable-unsafe-webgpu",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
  "--force-device-scale-factor=1",
  `--window-size=${width},${height}`,
  "about:blank",
];
if (!has("--visible")) chromeArgs.unshift("--headless=new");

const chrome = spawn(chromePath, chromeArgs, { stdio: ["ignore", "ignore", "pipe"] });
let chromeDiagnostics = "";
chrome.stderr.on("data", (chunk) => {
  chromeDiagnostics = `${chromeDiagnostics}${chunk}`.slice(-12_000);
});

const deadline = Date.now() + 30_000;
let version;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (response.ok) {
      version = await response.json();
      break;
    }
  } catch {}
  await sleep(100);
}
if (!version?.webSocketDebuggerUrl) {
  chrome.kill("SIGTERM");
  throw new Error(`Chrome debugging endpoint did not start\n${chromeDiagnostics}`);
}

const socket = new WebSocket(version.webSocketDebuggerUrl);
await once(socket, "open");
let commandId = 0;
const pending = new Map();
const listeners = new Set();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
    return;
  }
  for (const listener of listeners) listener(message);
});

const send = (method, params = {}, sessionId) =>
  new Promise((resolveSend, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve: resolveSend, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

const evaluate = async (sessionId, expression) => {
  const response = await send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? "Evaluation failed",
    );
  }
  return response.result.value;
};

const waitFor = async (sessionId, expression, timeoutMs, label) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const result = await evaluate(sessionId, expression);
    if (result) return result;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

/** Advance the frozen clock, or just let real time pass in --live mode. */
const step = (sessionId, count) =>
  live
    ? sleep((count / 60) * 1000)
    : evaluate(sessionId, `window.__shot.step(${count})`);

const results = [];
const errors = [];

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

  listeners.add((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(
        message.params.args.map((arg) => arg.value ?? arg.description).join(" "),
      );
    }
  });

  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    },
    sessionId,
  );
  if (!live) {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: FREEZE_CLOCK }, sessionId);
    // CSS animations run on the compositor's own clock, which the frozen rAF
    // does not reach. Pausing them keeps blinking text out of the diff.
    await send("Animation.enable", {}, sessionId);
    await send("Animation.setPlaybackRate", { playbackRate: 0 }, sessionId);
  }

  for (const shot of shots) {
    /**
     * Every shot starts from a fresh load. The particle sim is chaotic, so a
     * shot that inherited the frames of the shots before it would only be
     * reproducible when the whole list runs in the same order — `--shots 08`
     * would then never match a full baseline. Reloading makes each shot a
     * standalone experiment; the frozen clock restarts at zero with it.
     */
    await send("Page.navigate", { url: `${baseUrl}/?design=${design}` }, sessionId);
    await waitFor(
      sessionId,
      `Boolean(document.querySelector("[data-chapter]") && document.querySelector("canvas")${live ? "" : " && window.__shot"})`,
      60_000,
      "the route to mount",
    );
    await step(sessionId, warmup);

    /**
     * Same address arithmetic as semanticScrollTarget() in experienceState.ts:
     * the section's own travel is the scroll length of the chapter.
     *
     * The scroller is `scroll-behavior: smooth`, and the browser animates that
     * on real time — which the frozen clock never advances. `behavior:
     * "instant"` overrides the stylesheet and lands the scroll in one go.
     */
    const place = () =>
      evaluate(
        sessionId,
        `(() => {
          const section = document.querySelector('[data-chapter="${shot.chapter}"]');
          if (!section) return { ok: false, reason: "chapter not found" };
          let scroller = section.parentElement;
          while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
            scroller = scroller.parentElement;
          }
          scroller = scroller || document.scrollingElement;
          const travel = Math.max(section.offsetHeight - scroller.clientHeight, 0);
          const top = section.offsetTop + travel * ${shot.localProgress};
          scroller.scrollTo({ top, behavior: "instant" });
          return { ok: true, target: top, scrollTop: scroller.scrollTop };
        })()`,
      );

    let placed = await place();
    if (!placed.ok) throw new Error(`${shot.name}: ${placed.reason}`);
    await step(sessionId, frames);

    // Sections resize as the director animates them, so a placement can drift.
    // One correction pass is enough to settle every shot on the spine.
    if (Math.abs(placed.scrollTop - placed.target) > 1) {
      placed = await place();
      await step(sessionId, frames);
    }

    const { data } = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    const file = resolve(outputDir, `${shot.name}.png`);
    await writeFile(file, Buffer.from(data, "base64"));

    const observed = await evaluate(
      sessionId,
      `(() => {
        const live = document.querySelector('[data-chapter][data-live="true"]');
        return { chapter: live?.dataset.chapter ?? null, clock: window.__shot?.now() ?? null };
      })()`,
    );
    if (observed.chapter && observed.chapter !== shot.chapter) {
      errors.push(
        `${shot.name}: expected chapter ${shot.chapter}, director reports ${observed.chapter}`,
      );
    }

    results.push({ shot: shot.name, file, scrollTop: placed.scrollTop, ...observed });
    process.stdout.write(`shot ${shot.name} → ${file}\n`);
  }

  await send("Target.closeTarget", { targetId });
} finally {
  socket.close();
  chrome.kill("SIGTERM");
  await Promise.race([once(chrome, "exit"), sleep(5_000)]);
  await rm(profileDir, { recursive: true, force: true });
}

/**
 * Compares two shots pixel by pixel and writes a diff image that dims what
 * stayed the same and paints in red what moved.
 */
async function compare(currentPath, baselinePath, diffPath) {
  const [after, before] = await Promise.all([
    loadImage(currentPath),
    loadImage(baselinePath),
  ]);
  if (after.width !== before.width || after.height !== before.height) {
    return { changed: null, note: "size differs from baseline" };
  }

  const read = (image) => {
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  };
  const afterData = read(after);
  const beforeData = read(before);
  const diffCanvas = createCanvas(after.width, after.height);
  const diffContext = diffCanvas.getContext("2d");
  const diffData = diffContext.createImageData(after.width, after.height);

  let changed = 0;
  let total = 0;
  for (let i = 0; i < afterData.data.length; i += 4) {
    const delta =
      Math.abs(afterData.data[i] - beforeData.data[i]) +
      Math.abs(afterData.data[i + 1] - beforeData.data[i + 1]) +
      Math.abs(afterData.data[i + 2] - beforeData.data[i + 2]);
    total += delta;
    const moved = delta > 12;
    if (moved) changed += 1;
    const grey = (afterData.data[i] + afterData.data[i + 1] + afterData.data[i + 2]) / 6;
    diffData.data[i] = moved ? 255 : grey;
    diffData.data[i + 1] = moved ? 40 : grey;
    diffData.data[i + 2] = moved ? 40 : grey;
    diffData.data[i + 3] = 255;
  }
  diffContext.putImageData(diffData, 0, 0);
  await writeFile(diffPath, diffCanvas.toBuffer("image/png"));

  const pixels = afterData.data.length / 4;
  return {
    changedPixels: changed,
    changedPercent: Number(((changed / pixels) * 100).toFixed(2)),
    meanDelta: Number((total / pixels / 3).toFixed(2)),
    diff: diffPath,
  };
}

const comparisons = [];
if (!isBaseline) {
  for (const result of results) {
    const baselinePath = resolve(baselineDir, `${result.shot}.png`);
    if (!existsSync(baselinePath)) {
      comparisons.push({ shot: result.shot, note: "no baseline yet" });
      continue;
    }
    comparisons.push({
      shot: result.shot,
      ...(await compare(
        result.file,
        baselinePath,
        resolve(diffDir, `${result.shot}.png`),
      )),
    });
  }
}

const summary = {
  complete: true,
  mode: isBaseline ? "baseline" : "compare",
  clock: live ? "live" : "frozen",
  viewport: `${width}x${height}`,
  design,
  frames,
  warmup,
  outputDir,
  shots: results.length,
  consoleErrors: errors,
  comparisons,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (!isBaseline && comparisons.length) {
  process.stdout.write("\n");
  for (const item of comparisons) {
    const detail = item.note
      ? `? ${item.note}`
      : item.changedPercent >= threshold
        ? `CHANGED  ${item.changedPercent}% pixels moved → ${item.diff}`
        : `stable   ${item.changedPercent}%`;
    process.stdout.write(`  ${item.shot.padEnd(24)} ${detail}\n`);
  }
  const changed = comparisons.filter((item) => item.changedPercent >= threshold);
  process.stdout.write(
    changed.length
      ? `\n${changed.length} of ${comparisons.length} shots changed.\n`
      : `\nNo shot moved past the ${threshold}% noise floor.\n`,
  );
}

if (errors.length) {
  process.stderr.write(`\nPage errors:\n${errors.join("\n")}\n`);
  process.exit(1);
}
