#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const VARIANTS = ["default", "tri-noise", "flat", "shard"];
const FILENAMES = {
  default: "phase-field-a1-default-billboard-curl-coherence-studio.capture.webm",
  "tri-noise": "phase-field-a1-control-1-tri-noise.capture.webm",
  flat: "phase-field-a1-control-2-flat-material.capture.webm",
  shard: "phase-field-a1-control-3-shard-primitive.capture.webm",
};
const FINAL_FILENAMES = {
  default: "phase-field-a1-default-billboard-curl-coherence-studio.mp4",
  "tri-noise": "phase-field-a1-control-1-tri-noise.mp4",
  flat: "phase-field-a1-control-2-flat-material.mp4",
  shard: "phase-field-a1-control-3-shard-primitive.mp4",
};
const VIEWPORT = { width: 1280, height: 720, dpr: 1 };
const chromePath =
  process.env.PHASE_FIELD_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.PHASE_FIELD_BASE_URL ?? "http://127.0.0.1:3100";
const outputDir = resolve(
  process.env.PHASE_FIELD_OUTPUT_DIR ?? "output/phase-field-a1",
);
const requestedVariants = process.env.PHASE_FIELD_VARIANTS
  ? process.env.PHASE_FIELD_VARIANTS.split(",")
  : VARIANTS;

for (const variant of requestedVariants) {
  if (!VARIANTS.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  for (const filename of [FILENAMES[variant], FINAL_FILENAMES[variant]]) {
    if (existsSync(resolve(outputDir, filename))) {
      throw new Error(`Refusing to overwrite ${filename}`);
    }
  }
}
if (!existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);

await mkdir(outputDir, { recursive: true });

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

const profileDir = await mkdtemp(resolve(tmpdir(), "phase-field-recording-"));
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
  `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  "about:blank",
];
if (process.env.PHASE_FIELD_VISIBLE !== "1") chromeArgs.unshift("--headless=new");

const chrome = spawn(chromePath, chromeArgs, {
  stdio: ["ignore", "ignore", "pipe"],
});
let chromeDiagnostics = "";
chrome.stderr.on("data", (chunk) => {
  chromeDiagnostics = `${chromeDiagnostics}${chunk}`.slice(-12_000);
});

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const runProcess = async (command, args) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} failed (${code})\n${stderr}`);
  return stdout;
};
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
    throw new Error(response.exceptionDetails.exception?.description ?? "Evaluation failed");
  }
  return response.result.value;
};

const waitFor = async (sessionId, expression, timeoutMs) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await evaluate(sessionId, expression);
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
};

await send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: outputDir,
  eventsEnabled: true,
});

const results = [];
try {
  for (const variant of requestedVariants) {
    const errors = [];
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const attached = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    const onEvent = (message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.text);
      }
      if (
        message.method === "Runtime.consoleAPICalled" &&
        message.params.type === "error"
      ) {
        errors.push(
          message.params.args.map((arg) => arg.value ?? arg.description).join(" "),
        );
      }
      if (
        message.method === "Log.entryAdded" &&
        message.params.entry.level === "error"
      ) {
        errors.push(message.params.entry.text);
      }
    };
    listeners.add(onEvent);

    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Page.bringToFront", {}, sessionId);
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: VIEWPORT.dpr,
        mobile: false,
        screenWidth: VIEWPORT.width,
        screenHeight: VIEWPORT.height,
      },
      sessionId,
    );
    await send(
      "Page.navigate",
      { url: `${baseUrl}/proto/phase-field?record=${variant}` },
      sessionId,
    );
    await waitFor(
      sessionId,
      'document.querySelector("[data-recording-ready=\\"true\\"]") !== null',
      60_000,
    );

    const environment = await evaluate(
      sessionId,
      `({
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        gpu: Boolean(navigator.gpu),
        preset: window.__PF_RECORDING__.preset
      })`,
    );
    await evaluate(sessionId, 'window.__PF_RECORDING__.start(); "started"');
    const state = await waitFor(
      sessionId,
      `document.querySelector("[data-recording-state=\\"done\\"]") && ({
        file: document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingFile,
        durationMs: Number(document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingDurationMs),
        rafFrames: Number(document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingRafFrames),
        captureFrames: Number(document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingCaptureFrames),
        missedCaptureFrames: Number(document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingMissedCaptureFrames || 0),
        maxCaptureDelayMs: Number(document.querySelector("[data-recording-state=\\"done\\"]").dataset.recordingMaxCaptureDelayMs)
      })`,
      90_000,
    );

    const outputPath = resolve(outputDir, FILENAMES[variant]);
    const fileEnd = Date.now() + 30_000;
    while (!existsSync(outputPath) && Date.now() < fileEnd) await sleep(100);
    if (!existsSync(outputPath)) throw new Error(`Download missing: ${outputPath}`);
    const file = await stat(outputPath);
    if (errors.length) throw new Error(`${variant} console errors:\n${errors.join("\n")}`);
    if (state.captureFrames !== 3_600 || state.missedCaptureFrames !== 0) {
      throw new Error(
        `${variant} capture contaminated: ${state.captureFrames} frames, ${state.missedCaptureFrames} missed`,
      );
    }

    const rawProbe = JSON.parse(
      await runProcess("/opt/homebrew/bin/ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "json",
        outputPath,
      ]),
    );
    const rawFrames = Number(rawProbe.streams?.[0]?.nb_read_frames);
    if (rawFrames !== 3_600 && rawFrames !== 3_601) {
      throw new Error(
        `${variant} raw capture has ${rawFrames} frames, expected 3600 or one automatic start frame`,
      );
    }

    const finalPath = resolve(outputDir, FINAL_FILENAMES[variant]);
    const timingFilter =
      rawFrames === 3_601
        ? "select=gte(n\\,1),setpts=N/(60*TB)"
        : "setpts=N/(60*TB)";
    await runProcess("/opt/homebrew/bin/ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      outputPath,
      "-vf",
      timingFilter,
      "-frames:v",
      "3600",
      "-r",
      "60",
      "-fps_mode",
      "cfr",
      "-an",
      "-c:v",
      "h264_videotoolbox",
      "-b:v",
      "20M",
      "-profile:v",
      "high",
      "-allow_sw",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      finalPath,
    ]);
    const finalProbe = JSON.parse(
      await runProcess("/opt/homebrew/bin/ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,nb_read_frames:format=duration",
        "-of",
        "json",
        finalPath,
      ]),
    );
    const video = finalProbe.streams?.[0];
    if (
      Number(video?.nb_read_frames) !== 3_600 ||
      video?.avg_frame_rate !== "60/1" ||
      Number(finalProbe.format?.duration) !== 60
    ) {
      throw new Error(`${variant} CFR validation failed: ${JSON.stringify(finalProbe)}`);
    }
    const finalFile = await stat(finalPath);
    await rm(outputPath);

    const result = {
      variant,
      outputPath: finalPath,
      bytes: finalFile.size,
      rawCaptureBytes: file.size,
      recordedFrames: Number(video.nb_read_frames),
      recordedFrameRate: video.avg_frame_rate,
      recordedDuration: Number(finalProbe.format.duration),
      environment,
      state,
    };
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);

    listeners.delete(onEvent);
    await send("Target.closeTarget", { targetId });
  }
} finally {
  socket.close();
  chrome.kill("SIGTERM");
  await Promise.race([once(chrome, "exit"), sleep(5_000)]);
  await rm(profileDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ complete: true, outputDir, results })}\n`);
