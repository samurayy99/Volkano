import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PARTICLE_RENDERER_PATH =
  "/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js";

async function getSource() {
  return readFile(PARTICLE_RENDERER_PATH, "utf8");
}

test("fracture-side classification imports sign from three tsl", async () => {
  const source = await getSource();

  assert.match(
    source,
    /const fractureSide = sign\(fractureDist\)\.toConst\("fractureSide"\);/,
  );
  assert.match(source, /} from "three\/tsl";/);
  assert.match(source, /\bsign,\s*\n/);
});

test("late position branch builds the rift on the held monument baseline", async () => {
  const source = await getSource();

  assert.match(
    source,
    /const fracturePlaneN = normalize\(vec3\(1\.0, 0\.08, -0\.05\)\)/,
  );
  assert.match(
    source,
    /const halfOffset = fracturePlaneN[\s\S]*\.mul\(fractureSide\)[\s\S]*\.mul\(separationDistance\)[\s\S]*\.toConst\("halfOffset"\);/,
  );
  assert.match(
    source,
    /const riftPosition = heldMonumentPosition[\s\S]*\.add\(halfOffset\)[\s\S]*\.toConst\("riftPosition"\);/,
  );
  assert.match(
    source,
    /const edgeDissolveT = edgeExposure[\s\S]*clearFieldMix[\s\S]*releaseMix[\s\S]*\.toConst\("edgeDissolveT"\);/,
  );
});

test("late material branch mirrors the fracture and keeps renderer color authoring honest", async () => {
  const source = await getSource();

  assert.ok(
    source.includes(
      "const colorFracturePlaneN = normalize(vec3(1.0, 0.08, -0.05))",
    ),
  );
  assert.ok(source.includes("dot(colorFracturePlaneN)"));
  assert.ok(source.includes("colorFractureEdgeNoise"));
  assert.ok(source.includes('toConst("colorFractureProximity")'));
  assert.ok(
    source.includes("const frozenMaterialT = this.uniforms.convergenceFreeze"),
  );
  assert.ok(source.includes('"frozenMaterialT"'));
  assert.ok(source.includes("const materialLockT = smoothstep("));
  assert.ok(source.includes("const shellDarkenGate = smoothstep("));
  assert.ok(source.includes("float(0.26)"));
  assert.ok(source.includes("float(0.62)"));
  assert.ok(source.includes(".mul(frozenMaterialT)"));
  assert.ok(source.includes("const preCollapseFade = float(1)"));
  assert.ok(source.includes("this.uniforms.collapseMix"));
  assert.ok(
    source.includes(
      "const kluftColor = mix(shellColor, darkCoal, retreatFadeT)",
    ),
  );
  assert.ok(
    source.includes(
      "const finalColor = mix(surfaceColor, kluftColor, materialLockT)",
    ),
  );
  assert.doesNotMatch(source, /\bdebugHeatColor\b/);
  assert.doesNotMatch(source, /\bdebugMix\b/);
});

test("late monument shaping keeps a continuous facet field and locked rock proportions", async () => {
  const source = await getSource();
  const monumentDirectionBlock = source.match(
    /const monumentDirection = normalize\([\s\S]*?\)\.toConst\("monumentDirection"\);/,
  );

  assert.ok(monumentDirectionBlock, "expected monumentDirection block");
  assert.match(source, /const facetDirection = normalize\(/);
  assert.match(
    source,
    /const facetBlendT = shellPrivilege\.mul\(0\.14\)\.add\(0\.86\);/,
  );
  assert.match(monumentDirectionBlock[0], /facetDirection/);
  assert.doesNotMatch(monumentDirectionBlock[0], /tangentDir/);
  assert.doesNotMatch(source, /monumentHoldT/);
  assert.match(source, /const monumentLength = mix\([\s\S]*float\(0\.18\)/);
  assert.match(
    source,
    /const sculptedLength = mix\([\s\S]*monumentLength\.mul\(float\(2\.8\)\)/,
  );
});

test("late departure legacy helpers still support the rift pass until cleanup", async () => {
  const source = await getSource();

  assert.match(
    source,
    /const shellSeparationT = smoothstep\([\s\S]*releaseMix[\s\S]*\)\.toConst\("shellSeparationT"\);/,
  );
  assert.match(
    source,
    /const departureEnd = departureStart[\s\S]*add\(float\(0\.42\)\)[\s\S]*toConst\("departureEnd"\);/,
  );
  assert.match(
    source,
    /const shellCompressionBuildT = smoothstep\([\s\S]*this\.uniforms\.convergenceShapeMix[\s\S]*\)\.toConst\("shellCompressionBuildT"\);/,
  );
  assert.match(
    source,
    /const shellCompressionT = shellPrivilege[\s\S]*shellCompressionBuildT[\s\S]*shellSeparationT[\s\S]*\.toConst\("shellCompressionT"\);/,
  );
  assert.match(
    source,
    /const heldMonumentPosition = monumentPosition[\s\S]*sub\(shellCompressionOffset\)[\s\S]*\.toConst\("heldMonumentPosition"\);/,
  );
  assert.match(source, /const colorShellSeparationT = smoothstep\(/);
  assert.match(source, /const stagedPresenceT = float\(1\)/);
});

test("cleanup removes only the seven confirmed dead particle renderer symbols", async () => {
  const source = await getSource();

  assert.doesNotMatch(source, /import \{\n[\s\S]*\bvec2,\n/);
  assert.doesNotMatch(source, /\bthis\.shadowIndexCount\b/);
  assert.doesNotMatch(
    source,
    /\bconst chamberUp = vec3\(0, 1, 0\)\.toConst\("chamberUp"\);/,
  );
  assert.doesNotMatch(source, /\bconst transportT = mix\(/);
  assert.doesNotMatch(source, /\bconst departureT = smoothstep\(/);
  assert.doesNotMatch(source, /\bconst colorDepartureT = smoothstep\(/);
  assert.doesNotMatch(
    source,
    /\bconst obsidian = vec3\(0\.015, 0\.014, 0\.015\);/,
  );
});
