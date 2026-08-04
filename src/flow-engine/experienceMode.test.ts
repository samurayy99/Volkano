import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HERO_FIELD_PRESET,
  LIVING_SURFACE_PRESET,
  resolveExperienceMode,
  shouldStartLenoxDrive,
} from "./experienceMode.ts";
import {
  buildLivingSurfaceTargets,
  LIVING_SURFACE_SAFE_MARGIN,
} from "./livingSurfaceTargets.ts";

test("explicit experience mode wins over legacy booleans", () => {
  assert.equal(
    resolveExperienceMode({
      experienceMode: "living-surface",
      phaseField: true,
      lenoxMode: true,
    }),
    "living-surface",
  );
  assert.equal(resolveExperienceMode({ phaseField: true, lenoxMode: true }), "phase-field");
  assert.equal(resolveExperienceMode({ lenoxMode: true }), "legacy-lenox");
  assert.equal(resolveExperienceMode({}), "chamber");
});

test("only the legacy experience starts the retired Lenox drive", () => {
  assert.equal(shouldStartLenoxDrive("living-surface"), false);
  assert.equal(shouldStartLenoxDrive("phase-field"), false);
  assert.equal(shouldStartLenoxDrive("chamber"), false);
  assert.equal(shouldStartLenoxDrive("legacy-lenox"), true);
});

test("Hero Field owns a restrained reflective edge response", () => {
  assert.equal(HERO_FIELD_PRESET.wallRestitution, 0.42);
  assert.equal(HERO_FIELD_PRESET.screenBoundsRadiusScale, 1.2);
  assert.equal(HERO_FIELD_PRESET.screenBoundsFill, 0.86);
});

test("Living Surface production preset is locked to the Gate-1 hero state", () => {
  assert.equal(LIVING_SURFACE_PRESET.primitive, "billboard");
  assert.equal(LIVING_SURFACE_PRESET.particlesDesktop, 6_144);
  assert.equal(LIVING_SURFACE_PRESET.particlesBanded, 4_096);
  assert.equal(LIVING_SURFACE_PRESET.maxParticles, 8_192);
  assert.equal(LIVING_SURFACE_PRESET.size, 0.58);
  assert.equal(LIVING_SURFACE_PRESET.roughness, 0.48);
  assert.equal(LIVING_SURFACE_PRESET.metalness, 0.28);
  assert.equal(LIVING_SURFACE_PRESET.coherenceMaterial, true);
  assert.equal(LIVING_SURFACE_PRESET.coherenceDebug, false);
  assert.equal(LIVING_SURFACE_PRESET.environment, "studio");
  assert.equal(LIVING_SURFACE_PRESET.environmentIntensity, 0.2);
  assert.equal(LIVING_SURFACE_PRESET.gravity, 0);
  assert.equal(LIVING_SURFACE_PRESET.noise, 0.7);
  assert.equal(LIVING_SURFACE_PRESET.coherenceRelease, 0.42);
  assert.equal(LIVING_SURFACE_PRESET.targetInfluence, 0.16);
});

test("Living Surface targets are deterministic and stay inside safe bounds", () => {
  const bounds = {
    min: [3, 3, 3] as [number, number, number],
    max: [61, 61, 61] as [number, number, number],
  };
  const first = buildLivingSurfaceTargets(bounds, 4096);
  const second = buildLivingSurfaceTargets(bounds, 4096);
  assert.deepEqual(first, second);

  for (let i = 0; i < first.length; i++) {
    const axis = i % 3;
    const span = bounds.max[axis] - bounds.min[axis];
    const safeMin = bounds.min[axis] + span * LIVING_SURFACE_SAFE_MARGIN;
    const safeMax = bounds.max[axis] - span * LIVING_SURFACE_SAFE_MARGIN;
    assert.equal(Number.isFinite(first[i]), true);
    assert.ok(first[i] >= safeMin);
    assert.ok(first[i] <= safeMax);
  }
});
