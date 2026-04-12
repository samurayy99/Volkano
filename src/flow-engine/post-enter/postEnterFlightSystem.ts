import * as THREE from "three/webgpu";
import {
  float,
  Fn,
  fract,
  If,
  Return,
  instanceIndex,
  max,
  min,
  mix,
  sin,
  smoothstep,
  uint,
  uniform,
  vec3,
} from "three/tsl";
import { StructuredArray } from "../mls-mpm/structuredArray.js";
import type {
  PostEnterContext,
  PostEnterDerived,
} from "./PostEnterDirector";

const IS_DEV =
  typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

const FLIGHT_PHASE = Object.freeze({
  idle: 0,
  transport: 1,
  capture: 2,
  clear: 3,
  dead: 4,
});

const FLIGHT_TUNING = Object.freeze({
  /**
   * Commit→rift distance drives most of extract stagger (near spine first); seed/zonePhase
   * are small sprinkles only.
   */
  extractDelaySpatialMax: 0.74,
  extractDelaySeedSprinkle: 0.048,
  extractDelayZoneSprinkle: 0.055,
  lateralXMul: 0.0022,
  lateralYMul: 0.00125,
  /** Perpendicular fan on panel — attenuated by captureWeight in-kernel to avoid carpet lock. */
  captureSpineFanFrac: 0.072,
  captureZInsetFrac: 0.048,
  captureZBandFrac: 0.022,
  captureZExtraSpreadFrac: 0.011,
  captureLerpPerSec: 8.2,
  /** ±fraction around `captureLerpPerSec` from seed (keeps variance, one knob). */
  captureLerpSeedSpread: 0.2,
  captureWeightConverge: 0.66,
  captureAlongSpineJitter: 0.07,
  /** Narrower shell → capture only when genuinely intake-close (less front parking). */
  spatialCaptureDistLo: 0.032,
  spatialCaptureDistHi: 0.26,
  /** `1 - smoothstep(lo, hi, distNorm)` then × wall gate; edges strictly lo < hi. */
  corridorDistLo: 0.1,
  corridorDistHi: 0.58,
  corridorWallLo: 0.035,
  corridorWallHi: 0.62,
  /** Late assist ramps extractLocal here (early–mid extract, not end-only). */
  lateAssistExtractLo: 0.18,
  lateAssistExtractHi: 0.9,
  /** Earlier forward pull so the mass releases visibly (macro beat). */
  forwardGainExtractLo: 0.00035,
  forwardGainExtractHi: 0.014,
  /** Floor on wallBand factor in pullMag — higher = more pull when still front. */
  wallBandPullMin: 0.72,
  clearRateMin: 2.65,
  clearRateMax: 4.1,
  pullSpeedFrac: 0.155,
  wallPullBoostStartFrac: 0.2,
  pullLateralSectorMul: 0.11,
  /** Pull particles past hi.z during clear — through-wall read (fraction of chamber depth). */
  clearZThroughPullFrac: 0.3,
  clearPhaseEnterMixLo: 0.035,
  clearPhaseEnterMixHi: 0.11,
  /** Extra dissolve ramp from director `clearMix` alone (global completion, not wall-local). */
  clearDissolveGlobalMul: 2.05,
  captureWeightClearEnter: 0.44,
  /** Mid-extract: push away from chamber XY center to kill shared funnel / center blob. */
  antiFunnelSpreadMul: 0.0145,
  antiFunnelExtractLo: 0.18,
  antiFunnelExtractHi: 0.76,
  /**
   * Late extract: global capture eligibility (decoupled from corridor-only reads) so floor /
   * front matte cohort still enters capture/clear instead of stalling in transport.
   */
  extractGlobalCaptureLo: 0.74,
  extractGlobalCaptureHi: 0.98,
  /** Transport Z cap (fraction of depth below hi): tight early, opens late so mass can hug wall then vanish. */
  transportZCapFracEarly: 0.118,
  transportZCapFracLate: 0.0035,
});

const FLIGHT_STRUCT = Object.freeze({
  commitPos: { type: "vec3" as const },
  commitDir: { type: "vec3" as const },
  transportPos: { type: "vec3" as const },
  transportVel: { type: "vec3" as const },
  captureWeight: { type: "float" as const },
  dissolve: { type: "float" as const },
  flightPhase: { type: "float" as const },
  seed: { type: "float" as const },
  age: { type: "float" as const },
});

type MlsMpmSimRef = {
  renderer: THREE.WebGPURenderer;
  particleBuffer: InstanceType<typeof StructuredArray>;
  uniforms: { numParticles: { value: number } };
};

/**
 * GPU-owned post-freeze flight.
 *
 * Ownership:
 * - Freeze commit snapshots sim truth once.
 * - Transport: early-readable pull; light lateral wobble; extract stagger from commit→rift
 *   distance (not seed-primary).
 * - Capture: spine + fan-out perpendicular to pull; Z spread; clear pulls Z past the wall
 *   so particles do not stack as a billboard in front of the slit.
 * - Clear: mix + captureWeight gate; dissolve ramps with through-wall Z.
 *
 * Renderer consumes `transportPos`, `transportVel`, `captureWeight`, `dissolve`.
 */
export class PostEnterFlightSystem {
  readonly flightBuffer: InstanceType<typeof StructuredArray>;

  private readonly mls: MlsMpmSimRef;

  private readonly freezeCommitActive = uniform(0);
  private readonly flightActive = uniform(0);
  private readonly flightDt = uniform(0);
  private readonly extractMix = uniform(0);
  private readonly clearMix = uniform(0);
  private readonly transportSpeed = uniform(0.12);

  private readonly chamberMin = uniform(new THREE.Vector3());
  private readonly chamberMax = uniform(new THREE.Vector3());
  private readonly riftP0 = uniform(new THREE.Vector3());
  private readonly riftP1 = uniform(new THREE.Vector3());

  private commitKernel: {
    count?: number;
    updateDispatchCount?: () => void;
  };

  private flightKernel: {
    count?: number;
    updateDispatchCount?: () => void;
  };

  private commitDone = false;
  private pendingCommit = false;

  /** Dev-only: reset at start of each `broadcastPostEnterFrame` (before `onDirectorFrame`). */
  private devTelemetry = {
    sawExtractInOnDirector: false,
    commitKernelDispatched: false,
    transportKernelDispatched: false,
    syncSkipReason: null as string | null,
    extractLogTick: 0,
  };

  constructor(mlsMpmSim: MlsMpmSimRef) {
    this.mls = mlsMpmSim;

    const capacity = mlsMpmSim.particleBuffer.length;
    this.flightBuffer = new StructuredArray(
      { ...FLIGHT_STRUCT },
      capacity,
      "postEnterFlight",
    );

    for (let i = 0; i < capacity; i++) {
      this.flightBuffer.set(i, "commitPos", [0, 0, 0]);
      this.flightBuffer.set(i, "commitDir", [0, 0, 1]);
      this.flightBuffer.set(i, "transportPos", [0, 0, 0]);
      this.flightBuffer.set(i, "transportVel", [0, 0, 0]);
      this.flightBuffer.set(i, "captureWeight", 0);
      this.flightBuffer.set(i, "dissolve", 0);
      this.flightBuffer.set(i, "flightPhase", FLIGHT_PHASE.idle);
      this.flightBuffer.set(i, "seed", 0);
      this.flightBuffer.set(i, "age", 0);
    }

    this.commitKernel = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(
          uint(this.mls.uniforms.numParticles as never),
        ),
        () => {
          Return();
        },
      );

      If(this.freezeCommitActive.lessThan(float(0.5)), () => {
        Return();
      });

      const p = this.mls.particleBuffer.element(instanceIndex);
      const f = this.flightBuffer.element(instanceIndex);

      const pos = p.get("position").xyz.toConst("commitPosRead");
      const dirRaw = p.get("direction").xyz.toConst("commitDirRaw");
      const dirLen = dirRaw.length().max(float(1e-5)).toConst("commitDirLen");
      const dir = dirRaw.div(dirLen).toConst("commitDirNorm");

      const seed = fract(
        sin(instanceIndex.toFloat().mul(float(127.1))).mul(float(43758.5453)),
      ).toConst("commitSeed");

      f.get("commitPos").assign(pos);
      f.get("commitDir").assign(dir);
      f.get("transportPos").assign(pos);
      f.get("transportVel").assign(vec3(0, 0, 0));
      f.get("captureWeight").assign(float(0));
      f.get("dissolve").assign(float(0));
      f.get("flightPhase").assign(float(FLIGHT_PHASE.transport));
      f.get("seed").assign(seed);
      f.get("age").assign(float(0));
    })().compute(1) as unknown as typeof this.commitKernel;

    this.flightKernel = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(
          uint(this.mls.uniforms.numParticles as never),
        ),
        () => {
          Return();
        },
      );

      If(this.flightActive.lessThan(float(0.5)), () => {
        Return();
      });

      const f = this.flightBuffer.element(instanceIndex);
      const phase = f.get("flightPhase").toConst("flightPhaseRead");

      If(phase.lessThan(float(0.5)), () => {
        Return();
      });

      If(phase.greaterThan(float(3.5)), () => {
        f.get("captureWeight").assign(float(1));
        f.get("dissolve").assign(float(1));
        f.get("transportVel").assign(vec3(0, 0, 0));
        Return();
      });

      const dt = this.flightDt.max(float(1e-4)).toConst("flightDtSafe");

      const age = f.get("age").add(dt).toConst("flightAge");
      f.get("age").assign(age);

      const p = f.get("transportPos").xyz.toConst("flightPos");
      const seed = f.get("seed").clamp(0, 1).toConst("flightSeed");
      const seedX = seed.mul(float(2)).sub(float(1)).toConst("flightSeedX");
      const seedY = fract(seed.mul(float(17.13)))
        .mul(float(2))
        .sub(float(1))
        .toConst("flightSeedY");

      const commit = f.get("commitPos").xyz.toConst("commitRead");
      const zonePhase = fract(
        sin(
          commit.x
            .mul(float(12.9898))
            .add(commit.y.mul(float(78.233)))
            .add(commit.z.mul(float(45.164))),
        ).mul(float(43758.5453)),
      ).toConst("zonePhase");

      const lo = this.chamberMin;
      const hi = this.chamberMax;

      const chamberWidth = hi.x
        .sub(lo.x)
        .max(float(1e-4))
        .toConst("chamberWidth");
      const chamberHeight = hi.y
        .sub(lo.y)
        .max(float(1e-4))
        .toConst("chamberHeight");
      const chamberDepth = hi.z
        .sub(lo.z)
        .max(float(1e-4))
        .toConst("chamberDepth");

      const marginX = chamberWidth
        .mul(float(0.045))
        .max(float(0.02))
        .toConst("marginX");
      const marginY = chamberHeight
        .mul(float(0.045))
        .max(float(0.02))
        .toConst("marginY");

      const r0 = this.riftP0;
      const r1 = this.riftP1;
      const rectMinX = min(r0.x, r1.x).toConst("riftRectMinX");
      const rectMaxX = max(r0.x, r1.x).toConst("riftRectMaxX");
      const rectMinY = min(r0.y, r1.y).toConst("riftRectMinY");
      const rectMaxY = max(r0.y, r1.y).toConst("riftRectMaxY");
      const rectW = rectMaxX.sub(rectMinX).max(float(1e-5)).toConst("riftRectW");
      const zRift = r0.z.add(r1.z).mul(float(0.5)).toConst("zRift");

      /** Transport: pull to closest point on intake **panel** (not spine line). */
      const closestRect = vec3(
        p.x.clamp(rectMinX, rectMaxX),
        p.y.clamp(rectMinY, rectMaxY),
        zRift,
      ).toConst("riftClosestRect");

      const commitCx = commit.x.clamp(rectMinX, rectMaxX);
      const commitCy = commit.y.clamp(rectMinY, rectMaxY);
      const commitClosestRect = vec3(commitCx, commitCy, zRift).toConst(
        "commitClosestRect",
      );
      const commitDistToRift = commit
        .sub(commitClosestRect)
        .length()
        .max(float(1e-5))
        .toConst("commitDistRiftLen");
      const commitDistNorm = commitDistToRift
        .div(chamberDepth.max(float(0.01)))
        .toConst("commitDistNorm");

      const delaySpatial = smoothstep(
        float(0.045),
        float(0.58),
        commitDistNorm,
      )
        .mul(float(FLIGHT_TUNING.extractDelaySpatialMax))
        .toConst("delaySpatial");

      const delayMix = delaySpatial
        .add(seed.mul(float(FLIGHT_TUNING.extractDelaySeedSprinkle)))
        .add(zonePhase.mul(float(FLIGHT_TUNING.extractDelayZoneSprinkle)))
        .clamp(0, 0.88)
        .toConst("delayMix");

      const extractLocal = this.extractMix
        .sub(delayMix)
        .max(float(0))
        .div(float(1).sub(delayMix).max(float(0.001)))
        .clamp(0, 1)
        .toConst("extractLocal");

      const forwardGain = smoothstep(
        float(FLIGHT_TUNING.forwardGainExtractLo),
        float(FLIGHT_TUNING.forwardGainExtractHi),
        extractLocal,
      ).toConst("forwardGain");

      const forwardGainMacro = max(
        forwardGain,
        float(0.22).mul(smoothstep(float(0), float(0.16), extractLocal)),
      ).toConst("forwardGainMacro");

      const swayEnvelope = smoothstep(float(0.08), float(0.42), extractLocal)
        .mul(float(1).sub(smoothstep(float(0.72), float(0.98), extractLocal)))
        .toConst("swayEnvelope");

      const swayPhaseX = age
        .mul(mix(float(1.1), float(1.8), seed))
        .add(seed.mul(float(6.2831853)))
        .toConst("swayPhaseX");

      const swayPhaseY = age
        .mul(mix(float(0.72), float(1.25), seed))
        .add(seed.mul(float(11.3)))
        .toConst("swayPhaseY");

      const swayX = sin(swayPhaseX)
        .mul(chamberWidth.mul(float(FLIGHT_TUNING.lateralXMul)))
        .mul(swayEnvelope)
        .toConst("swayX");

      const swayY = sin(swayPhaseY)
        .mul(chamberHeight.mul(float(FLIGHT_TUNING.lateralYMul)))
        .mul(swayEnvelope)
        .toConst("swayY");

      const wallBand = smoothstep(
        lo.z.add(chamberDepth.mul(float(FLIGHT_TUNING.wallPullBoostStartFrac))),
        hi.z.sub(chamberDepth.mul(float(0.05))),
        p.z,
      ).toConst("wallBand");

      const chamberMidX = lo.x.add(hi.x).mul(float(0.5)).toConst("chamberMidX");
      const lateralNorm = p.x
        .sub(chamberMidX)
        .abs()
        .div(chamberWidth.max(float(1e-4)))
        .clamp(0, 1)
        .toConst("lateralNorm");

      const sectorWobble = sin(
        seed.mul(float(6.2831853)).add(lateralNorm.mul(float(7.3))),
      )
        .mul(float(FLIGHT_TUNING.pullLateralSectorMul))
        .add(float(1))
        .toConst("sectorWobble");

      const toRift = closestRect.sub(p).toConst("toRiftVec");
      const distToRift = toRift.length().max(float(1e-5)).toConst("distToRift");
      const pullDir = toRift.div(distToRift).toConst("pullDirNorm");

      const pullMag = this.transportSpeed
        .mul(mix(float(0.88), float(1.12), seed))
        .mul(forwardGainMacro)
        .mul(
          mix(
            float(FLIGHT_TUNING.wallBandPullMin),
            float(1.0),
            wallBand,
          ),
        )
        /* Was 0.35..1 and froze the carpet; keep only light zone modulation. */
        .mul(mix(float(0.82), float(1.0), zonePhase))
        .mul(sectorWobble)
        .toConst("pullMag");

      const perpXY = vec3(pullDir.y.negate(), pullDir.x, float(0)).toConst(
        "perpXYRaw",
      );
      const perpLen = perpXY.length().max(float(1e-5)).toConst("perpLen");
      const perpN = perpXY.div(perpLen).toConst("perpN");
      const tangentialJitter = perpN
        .mul(
          sin(
            age
              .mul(float(2.15))
              .add(zonePhase.mul(float(19.7)))
              .add(seed.mul(float(31.1))),
          ),
        )
        .mul(chamberWidth.mul(float(0.0024)))
        .mul(swayEnvelope)
        .mul(mix(float(0.6), float(1.4), zonePhase))
        .toConst("tangentialJitter");

      const captureZBase = hi.z
        .sub(chamberDepth.mul(float(FLIGHT_TUNING.captureZInsetFrac)))
        .toConst("captureZBase");

      const distNorm = distToRift
        .div(chamberDepth.max(float(0.01)))
        .toConst("distNorm");

      const spatialCapture = float(1)
        .sub(
          smoothstep(
            float(FLIGHT_TUNING.spatialCaptureDistLo),
            float(FLIGHT_TUNING.spatialCaptureDistHi),
            distNorm,
          ),
        )
        .toConst("spatialCapture");

      const distCorridor = float(1)
        .sub(
          smoothstep(
            float(FLIGHT_TUNING.corridorDistLo),
            float(FLIGHT_TUNING.corridorDistHi),
            distNorm,
          ),
        )
        .toConst("distCorridor");

      const wallCorridor = smoothstep(
        float(FLIGHT_TUNING.corridorWallLo),
        float(FLIGHT_TUNING.corridorWallHi),
        wallBand,
      ).toConst("wallCorridor");

      const corridorGate = distCorridor.mul(wallCorridor).toConst("corridorGate");

      const lateAssist = smoothstep(
        float(FLIGHT_TUNING.lateAssistExtractLo),
        float(FLIGHT_TUNING.lateAssistExtractHi),
        extractLocal,
      )
        .mul(corridorGate)
        .toConst("lateAssist");

      const enterCapture = max(spatialCapture, lateAssist).toConst(
        "enterCapture",
      );
      const enterCaptureGlobal = smoothstep(
        float(FLIGHT_TUNING.extractGlobalCaptureLo),
        float(FLIGHT_TUNING.extractGlobalCaptureHi),
        extractLocal,
      ).toConst("enterCaptureGlobal");
      const enterCaptureCombined = max(
        enterCapture,
        enterCaptureGlobal,
      ).toConst("enterCaptureCombined");

      If(phase.lessThan(float(1.5)), () => {
        const antiFunnelT = smoothstep(
          float(FLIGHT_TUNING.antiFunnelExtractLo),
          float(FLIGHT_TUNING.antiFunnelExtractHi),
          extractLocal,
        )
          .mul(float(1).sub(smoothstep(float(0.82), float(0.98), extractLocal)))
          .toConst("antiFunnelT");

        const chamberMidXY = vec3(
          lo.x.add(hi.x).mul(float(0.5)),
          lo.y.add(hi.y).mul(float(0.5)),
          float(0),
        ).toConst("chamberMidXY");
        const awayXY = vec3(
          p.x.sub(chamberMidXY.x),
          p.y.sub(chamberMidXY.y),
          float(0),
        ).toConst("awayXY");
        const awayLen = awayXY.length().max(float(1e-5)).toConst("awayLen");
        const awayN = awayXY.div(awayLen).toConst("awayN");
        const antiFunnel = awayN
          .mul(chamberWidth.mul(float(FLIGHT_TUNING.antiFunnelSpreadMul)))
          .mul(antiFunnelT)
          .toConst("antiFunnel");

        const stepVec = pullDir
          .mul(pullMag.mul(dt))
          .add(vec3(swayX, swayY, float(0)))
          .add(tangentialJitter.mul(dt))
          .add(antiFunnel.mul(dt))
          .toConst("transportStep");

        const q = p.add(stepVec).toConst("transportCandidate");

        const zCapFrac = mix(
          float(FLIGHT_TUNING.transportZCapFracEarly),
          float(FLIGHT_TUNING.transportZCapFracLate),
          smoothstep(float(0.14), float(0.9), extractLocal),
        ).toConst("zCapFrac");
        const zCap = hi.z.sub(chamberDepth.mul(zCapFrac)).toConst("transportZCap");

        const nextPos = vec3(
          q.x.clamp(lo.x.add(marginX), hi.x.sub(marginX)),
          q.y.clamp(lo.y.add(marginY), hi.y.sub(marginY)),
          min(q.z, zCap),
        ).toConst("transportNextPos");

        f.get("transportPos").assign(nextPos);
        f.get("transportVel").assign(nextPos.sub(p).div(dt));

        If(enterCaptureCombined.greaterThan(float(0.62)), () => {
          f.get("flightPhase").assign(float(FLIGHT_PHASE.capture));
        });

        Return();
      });

      /** Capture: X → spine; Y compresses toward slit mid (after `captureLerp` exists). */
      const spineX = rectMinX.add(rectMaxX).mul(float(0.5)).toConst("riftSpineX");
      const rectCy = rectMinY.add(rectMaxY).mul(float(0.5)).toConst("riftRectCy");
      const panelY = p.y.clamp(rectMinY, rectMaxY).toConst("riftPanelY");

      const captureLerpPerSecVar = float(FLIGHT_TUNING.captureLerpPerSec)
        .mul(
          mix(
            float(1).sub(float(FLIGHT_TUNING.captureLerpSeedSpread)),
            float(1).add(float(FLIGHT_TUNING.captureLerpSeedSpread)),
            seed,
          ),
        )
        .mul(mix(float(0.88), float(1.06), zonePhase))
        .toConst("captureLerpPerSecVar");

      const captureLerp = dt
        .mul(captureLerpPerSecVar)
        .clamp(0, 1)
        .toConst("captureLerp");

      const yCollapseT = smoothstep(float(0.06), float(0.98), captureLerp)
        .mul(smoothstep(float(0.06), float(0.98), captureLerp))
        .toConst("yCollapseT");
      const spineY = mix(panelY, rectCy, yCollapseT.mul(float(0.97))).toConst(
        "riftSpineY",
      );

      const capX = mix(p.x, spineX, captureLerp)
        .clamp(rectMinX, rectMaxX)
        .toConst("capX");

      const capY = mix(p.y, spineY, captureLerp)
        .clamp(rectMinY, rectMaxY)
        .toConst("capY");

      const cwPrev = f.get("captureWeight").clamp(0, 1).toConst("cwPrev");
      const fanAtten = float(1)
        .sub(cwPrev.mul(float(0.92)))
        .mul(
          float(1).sub(smoothstep(float(0.22), float(0.95), captureLerp).mul(float(0.75))),
        )
        .toConst("fanAtten");
      const fanMag = rectW
        .mul(float(FLIGHT_TUNING.captureSpineFanFrac))
        .mul(smoothstep(float(0.12), float(1), captureLerp))
        .mul(seedX)
        .mul(fanAtten)
        .toConst("fanMag");
      const capXFan = capX
        .add(perpN.x.mul(fanMag))
        .clamp(rectMinX, rectMaxX)
        .toConst("capXFan");
      const capYFan = capY
        .add(perpN.y.mul(fanMag))
        .clamp(rectMinY, rectMaxY)
        .toConst("capYFan");

      const spineMagnet = cwPrev.mul(cwPrev).mul(float(0.62)).toConst("spineMagnet");
      const capXSpine = mix(capXFan, spineX, spineMagnet)
        .clamp(rectMinX, rectMaxX)
        .toConst("capXSpine");
      const capYSpine = mix(capYFan, rectCy, spineMagnet)
        .clamp(rectMinY, rectMaxY)
        .toConst("capYSpine");

      const captureZSpread = seedY
        .mul(chamberDepth.mul(float(FLIGHT_TUNING.captureZExtraSpreadFrac)))
        .add(
          zonePhase.mul(
            chamberDepth.mul(
              float(FLIGHT_TUNING.captureZExtraSpreadFrac * 0.75),
            ),
          ),
        )
        .toConst("captureZSpread");

      const captureZVar = captureZBase
        .sub(
          seed
            .mul(chamberDepth.mul(float(FLIGHT_TUNING.captureZBandFrac)))
            .add(captureZSpread),
        )
        .toConst("captureZVar");

      const zPullThrough = smoothstep(float(0.35), float(1), captureLerp)
        .mul(float(0.94))
        .add(float(0.06))
        .toConst("zPullThrough");

      const capturedPos = vec3(
        capXSpine.add(seedX.mul(chamberWidth.mul(float(0.0024)))),
        capYSpine.add(seedY.mul(chamberHeight.mul(float(0.0024)))),
        mix(p.z, captureZVar, captureLerp.mul(zPullThrough)),
      ).toConst("capturedPos");

      const nextCaptureWeight = mix(
        f.get("captureWeight"),
        float(1),
        captureLerp.mul(float(FLIGHT_TUNING.captureWeightConverge)),
      )
        .clamp(0, 1)
        .toConst("nextCaptureWeight");

      const clearMixThresh = mix(
        float(FLIGHT_TUNING.clearPhaseEnterMixLo),
        float(FLIGHT_TUNING.clearPhaseEnterMixHi),
        seed,
      ).toConst("clearMixThresh");

      If(phase.lessThan(float(2.5)), () => {
        f.get("transportPos").assign(capturedPos);
        f.get("transportVel").assign(capturedPos.sub(p).div(dt));
        f.get("captureWeight").assign(nextCaptureWeight);

        If(this.clearMix.greaterThan(clearMixThresh), () => {
          If(
            f
              .get("captureWeight")
              .greaterThan(float(FLIGHT_TUNING.captureWeightClearEnter)),
            () => {
              f.get("flightPhase").assign(float(FLIGHT_PHASE.clear));
            },
          );
        });

        Return();
      });

      const clearRate = mix(
        float(FLIGHT_TUNING.clearRateMin),
        float(FLIGHT_TUNING.clearRateMax),
        seed,
      ).toConst("clearRate");

      const clearDriver = this.clearMix.max(float(0.04)).toConst("clearDriver");

      const wallDissolveScale = float(1)
        .sub(smoothstep(float(0.028), float(0.2), distNorm))
        .toConst("wallDissolveScale");

      const clearDissolveGlobal = this.clearMix
        .mul(this.clearMix)
        .mul(dt)
        .mul(float(FLIGHT_TUNING.clearDissolveGlobalMul))
        .toConst("clearDissolveGlobal");

      const nextDissolve = min(
        float(1),
        max(f.get("dissolve"), this.clearMix)
          .add(
            clearRate
              .mul(dt)
              .mul(clearDriver)
              .mul(max(float(0.09), wallDissolveScale)),
          )
          .add(clearDissolveGlobal),
      ).toConst("nextDissolve");

      const clearThroughZ = capturedPos.z.add(
        this.clearMix
          .mul(chamberDepth.mul(float(FLIGHT_TUNING.clearZThroughPullFrac)))
          .mul(smoothstep(float(0.0), float(0.72), this.clearMix)),
      );

      const clearSpinePull = smoothstep(float(0.0), float(0.78), this.clearMix)
        .mul(smoothstep(float(0.0), float(0.78), this.clearMix))
        .toConst("clearSpinePull");
      const rectCyClear = rectMinY.add(rectMaxY).mul(float(0.5)).toConst(
        "rectCyClear",
      );
      const clearX = mix(capturedPos.x, spineX, clearSpinePull.mul(float(0.98)))
        .clamp(rectMinX, rectMaxX)
        .toConst("clearSpineX");
      const clearY = mix(capturedPos.y, rectCyClear, clearSpinePull.mul(float(0.96)))
        .clamp(rectMinY, rectMaxY)
        .toConst("clearSpineY");

      const finalPos = vec3(clearX, clearY, clearThroughZ).toConst("finalPos");

      f.get("transportPos").assign(finalPos);
      f.get("transportVel").assign(finalPos.sub(p).div(dt));
      f.get("captureWeight").assign(max(nextCaptureWeight, float(0.92)));
      f.get("dissolve").assign(nextDissolve);

      If(nextDissolve.greaterThanEqual(float(0.999)), () => {
        f.get("flightPhase").assign(float(FLIGHT_PHASE.dead));
      });
    })().compute(1) as unknown as typeof this.flightKernel;
  }

  /**
   * Dev-only: call at the very start of `broadcastPostEnterFrame` (before `onDirectorFrame`).
   */
  devResetApplyCycleTelemetry(): void {
    if (!IS_DEV) {
      return;
    }
    this.devTelemetry.sawExtractInOnDirector = false;
  }

  /**
   * Dev-only: call at the start of `App.update` before the flight dispatch chain.
   */
  devResetEngineFrameTelemetry(): void {
    if (!IS_DEV) {
      return;
    }
    this.devTelemetry.commitKernelDispatched = false;
    this.devTelemetry.transportKernelDispatched = false;
    this.devTelemetry.syncSkipReason = null;
  }

  /**
   * Dev-only: after flight chain in `extract`, logs a compact checklist (throttled).
   * CPU `floatArray` samples may not mirror GPU without readback — see `bufferCpuNote`.
   */
  devLogExtractLifecycleIfEnabled(
    storedDerived: PostEnterDerived | null | undefined,
    storedContext: PostEnterContext | null | undefined,
    rendererHasFlightBinding: boolean,
  ): void {
    if (!IS_DEV || storedDerived?.postEnterPhase !== "extract") {
      return;
    }

    this.devTelemetry.extractLogTick += 1;
    if (this.devTelemetry.extractLogTick % 45 !== 0) {
      return;
    }

    const n = this.mls.uniforms.numParticles.value | 0;
    const fa = this.flightBuffer.floatArray;
    const layout = this.flightBuffer.layout as unknown as Record<
      string,
      { offset: number }
    >;
    const stride = this.flightBuffer.structSize;

    const sample = (i: number) => {
      if (i < 0 || i >= n || !layout.transportPos || !layout.flightPhase) {
        return null;
      }
      const b = i * stride + layout.transportPos.offset;
      const ph = i * stride + layout.flightPhase.offset;
      return {
        i,
        transport: [fa[b], fa[b + 1], fa[b + 2]] as const,
        flightPhase: fa[ph],
      };
    };

    const idxMid = n > 1 ? n >> 1 : 0;
    const idxLast = n > 0 ? n - 1 : 0;

    const firstBroken = (() => {
      if (!storedDerived) {
        return "storedDerived_null_after_apply";
      }
      if (!this.devTelemetry.sawExtractInOnDirector) {
        return "onDirectorFrame_not_seen_for_extract_this_apply_cycle";
      }
      if (!this.commitDone) {
        if (this.pendingCommit) {
          return "commitDone_false_pendingCommit_true_awaiting_or_stuck";
        }
        return "commitDone_false_pendingCommit_false_commit_dead";
      }
      if (!storedContext) {
        return "storedContext_null_in_update";
      }
      if (
        this.devTelemetry.syncSkipReason &&
        this.devTelemetry.syncSkipReason !== "ok"
      ) {
        return `syncTransportFrame_exit:${this.devTelemetry.syncSkipReason}`;
      }
      if (this.flightActive.value < 0.5) {
        return "flightActive_uniform_zero";
      }
      if (!this.devTelemetry.transportKernelDispatched) {
        return "transport_kernel_not_dispatched_despite_flightActive";
      }
      return "chain_ok_check_renderer_shader_read_cpu_buffer_may_lag_gpu";
    })();

    console.info("[PostEnterFlight lifecycle / extract]", {
      firstBrokenLinkGuess: firstBroken,
      pendingCommit: this.pendingCommit,
      commitDone: this.commitDone,
      commitKernelDispatchedThisFrame: this.devTelemetry.commitKernelDispatched, // true only on frames that run commit compute
      transportKernelDispatchedThisFrame:
        this.devTelemetry.transportKernelDispatched,
      flightActiveUniform: this.flightActive.value,
      extractMixUniform: this.extractMix.value,
      clearMixUniform: this.clearMix.value,
      numParticles: n,
      sawExtractInOnDirectorThisApply: this.devTelemetry.sawExtractInOnDirector,
      storedDerivedPresent: !!storedDerived,
      storedContextPresent: !!storedContext,
      directorExtractMix: storedDerived.extractMix,
      rendererHasFlightBinding,
      cpuBufferSamples: [sample(0), sample(idxMid), sample(idxLast)],
      bufferCpuNote:
        "floatArray may not reflect GPU writes without readback; use dispatch flags + flightActive",
    });
  }

  /**
   * Advance gate for extract → clear_hold. Must not sample `flightBuffer.floatArray`:
   * flight fields are GPU-authored; CPU TypedArray is not reliable without readback.
   * Timeline slack belongs in `PostEnterDirector` durations, not stale buffer hints.
   */
  shouldHoldExtractPastNominal(_ctx: {
    nominalDurationSec: number;
    overshootPastNominalSec: number;
  }): boolean {
    return false;
  }

  /**
   * Advance gate for clear_hold → quiet. Same contract as `shouldHoldExtractPastNominal`.
   */
  shouldHoldClearPastNominal(_ctx: {
    nominalDurationSec: number;
    overshootPastNominalSec: number;
  }): boolean {
    return false;
  }

  onDirectorFrame(derived: PostEnterDerived | null | undefined): void {
    if (IS_DEV && derived?.postEnterPhase === "extract") {
      this.devTelemetry.sawExtractInOnDirector = true;
    }

    if (!derived || derived.postEnterPhase === "idle") {
      return;
    }

    if (
      !this.commitDone &&
      derived.solverLocked &&
      (derived.postEnterPhase === "arrest" ||
        derived.postEnterPhase === "extract" ||
        derived.postEnterPhase === "clear_hold")
    ) {
      // `extract` / `clear_hold`: recovery if arming during `arrest` was missed (e.g. stored derived cleared).
      this.pendingCommit = true;
    }
  }

  syncTransportFrame(
    derived: PostEnterDerived | null | undefined,
    context: PostEnterContext | null | undefined,
    deltaSec: number,
  ): void {
    if (IS_DEV) {
      if (!this.commitDone) {
        this.devTelemetry.syncSkipReason = "!commitDone";
      } else if (!derived) {
        this.devTelemetry.syncSkipReason = "!derived";
      } else if (!context) {
        this.devTelemetry.syncSkipReason = "!context";
      } else {
        this.devTelemetry.syncSkipReason = "ok";
      }
    }

    if (!this.commitDone || !derived || !context) {
      this.flightActive.value = 0;
      return;
    }

    this.chamberMin.value.copy(context.chamberBoundsSim.min);
    this.chamberMax.value.copy(context.chamberBoundsSim.max);
    this.riftP0.value.copy(context.riftSlitP0Sim);
    this.riftP1.value.copy(context.riftSlitP1Sim);

    const dz = context.chamberBoundsSim.max.z - context.chamberBoundsSim.min.z;
    this.transportSpeed.value = Math.max(
      0.02,
      (dz * FLIGHT_TUNING.pullSpeedFrac) / 2.75,
    );

    this.flightDt.value = Math.min(Math.max(deltaSec, 0), 0.05);
    this.extractMix.value = derived.extractMix;
    this.clearMix.value = derived.clearMix;

    this.flightActive.value =
      derived.postEnterPhase === "extract" ||
      derived.postEnterPhase === "clear_hold"
        ? 1
        : 0;
  }

  async dispatchFreezeCommitIfNeeded(): Promise<void> {
    if (!this.pendingCommit || this.commitDone) {
      return;
    }

    const renderer = this.mls.renderer;
    if (!renderer) {
      return;
    }

    const n = this.mls.uniforms.numParticles.value | 0;
    if (n <= 0) {
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV !== "production"
      ) {
        console.warn(
          "[PostEnterFlightSystem] freeze commit skipped: numParticles is 0 (keeping pendingCommit for retry)",
        );
      }
      return;
    }

    this.commitKernel.count = n;
    this.commitKernel.updateDispatchCount?.();

    this.freezeCommitActive.value = 1;
    await renderer.computeAsync([this.commitKernel] as never);
    this.freezeCommitActive.value = 0;

    // Do not call markFlightBufferDirty() here: needsUpdate bumps BufferAttribute.version
    // and WebGPUAttributeUtils.update → queue.writeBuffer uploads stale CPU floatArray,
    // overwriting GPU compute results (same StorageInstancedBufferAttribute.array).
    this.commitDone = true;
    this.pendingCommit = false;
    if (IS_DEV) {
      this.devTelemetry.commitKernelDispatched = true;
    }
  }

  async dispatchTransportPass(): Promise<void> {
    if (this.flightActive.value < 0.5) {
      return;
    }

    const renderer = this.mls.renderer;
    if (!renderer) {
      return;
    }

    const n = this.mls.uniforms.numParticles.value | 0;
    if (n <= 0) {
      return;
    }

    this.flightKernel.count = n;
    this.flightKernel.updateDispatchCount?.();

    await renderer.computeAsync([this.flightKernel] as never);
    // Same as commit: no needsUpdate after GPU-only writes (see dispatchFreezeCommitIfNeeded).
    if (IS_DEV) {
      this.devTelemetry.transportKernelDispatched = true;
    }
  }

  resetForCycle(): void {
    this.commitDone = false;
    this.pendingCommit = false;
    this.freezeCommitActive.value = 0;
    this.flightActive.value = 0;
    this.extractMix.value = 0;
    this.clearMix.value = 0;

    const cap = this.flightBuffer.length;
    for (let i = 0; i < cap; i++) {
      this.flightBuffer.set(i, "commitPos", [0, 0, 0]);
      this.flightBuffer.set(i, "commitDir", [0, 0, 1]);
      this.flightBuffer.set(i, "transportPos", [0, 0, 0]);
      this.flightBuffer.set(i, "transportVel", [0, 0, 0]);
      this.flightBuffer.set(i, "captureWeight", 0);
      this.flightBuffer.set(i, "dissolve", 0);
      this.flightBuffer.set(i, "flightPhase", FLIGHT_PHASE.idle);
      this.flightBuffer.set(i, "seed", 0);
      this.flightBuffer.set(i, "age", 0);
    }

    this.markFlightBufferDirty();
  }

  dispose(): void {
    // Renderer owns GPU teardown.
  }

  /** CPU-authored `flightBuffer.set(...)` only — never after GPU compute on this buffer. */
  private markFlightBufferDirty(): void {
    const attr = (
      this.flightBuffer.buffer as unknown as {
        value?: { needsUpdate?: boolean };
      }
    )?.value;

    if (attr) {
      attr.needsUpdate = true;
    }
  }
}
