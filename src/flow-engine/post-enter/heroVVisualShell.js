import * as THREE from "three/webgpu";
import { HERO_POINT_CLOUD } from "../mls-mpm/mlsMpmSimulator.js";

/**
 * Late-branch visual shell for the post-enter V monument.
 *
 * Presentation-only:
 * - does NOT feed the simulator
 * - does NOT replace hero target generation
 * - does NOT sample mesh data back into MLS/MPM
 *
 * Assumption:
 * - `mlsMpmSim.uniforms.heroCenter.value` is the simulator-owned arrest anchor
 *   in the local space of `particleRenderer.object`
 * - `HERO_POINT_CLOUD.centerX/Y/Z` are authored placement offsets from that anchor
 *
 * This module owns only the final shell read:
 * - split-wing mass
 * - inner seam accent
 * - late visual claim staging
 *
 * It intentionally does NOT reuse the particle contour rails as shell truth.
 */

const MASS_RENDER_ORDER = 20;
const EDGE_RENDER_ORDER = 21;

const SHELL_PROFILE = Object.freeze({
  rows: 40,
  cols: 11,
  edgeCols: 4,
  massInnerSpanShoulder: 0.68,
  massInnerSpanApex: 0.18,

  shoulderY: 16.7,
  midY: 3.75,
  apexY: -8.5,

  innerHalfGapShoulder: 4.76,
  innerHalfGapMid: 2.52,
  innerHalfGapApex: 0.0,

  outerReachShoulder: 8.68,
  outerReachMid: 4.9,
  outerReachApex: 0.14,

  shoulderFlare: 0.42,
  outerShoulderLift: 0.52,
  innerShoulderDrop: 0.16,
  seamCompression: 0.085,
  apexPinch: 0.24,
  apexDrop: 0.08,

  frontInnerShoulder: 0.14,
  frontInnerApex: 0.03,
  frontOuterShoulder: 0.94,
  frontOuterApex: 0.09,
  frontShoulderLift: 0.16,
  frontApexCut: 0.055,

  backInnerShoulder: -0.08,
  backInnerApex: -0.012,
  backOuterShoulder: -0.56,
  backOuterApex: -0.05,
  backShoulderPush: -0.04,
  backApexRelease: 0.01,

  seamBandWidth: 0.17,
  seamInsetBase: 0.06,
  seamInsetShoulder: 0.065,

  seamFrontInnerShoulder: 0.26,
  seamFrontInnerApex: 0.07,
  seamFrontOuterShoulder: 0.2,
  seamFrontOuterApex: 0.055,
  seamFrontShoulderLift: 0.035,
  seamFrontApexCut: 0.018,

  seamBackInnerShoulder: -0.03,
  seamBackInnerApex: -0.006,
  seamBackOuterShoulder: -0.018,
  seamBackOuterApex: -0.004,

  resolveScaleStart: 0.988,
});

function clamp01(v) {
  return THREE.MathUtils.clamp(v, 0, 1);
}

function smooth01(v) {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

function appendQuad(indices, a, b, c, d, flip = false) {
  if (!flip) {
    indices.push(a, b, c, a, c, d);
  } else {
    indices.push(a, c, b, a, d, c);
  }
}

function finalizeGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function evalTriplet(a, b, c, t) {
  const x = clamp01(t);
  const omt = 1 - x;
  return omt * omt * a + 2 * omt * x * b + x * x * c;
}

function evalSpanRange(start, end, t) {
  return THREE.MathUtils.lerp(start, end, clamp01(t));
}

function evalMassInnerSpan(profile, armT) {
  const t = THREE.MathUtils.smoothstep(clamp01(armT), 0.18, 1.0);
  return THREE.MathUtils.lerp(
    profile.massInnerSpanShoulder,
    profile.massInnerSpanApex,
    t,
  );
}

function evalWingRails(profile, armT) {
  const t = clamp01(armT);
  const shoulderT = 1 - THREE.MathUtils.smoothstep(t, 0.18, 0.9);
  const apexT = THREE.MathUtils.smoothstep(t, 0.58, 1.0);

  return {
    shoulderT,
    apexT,
    y: evalTriplet(profile.shoulderY, profile.midY, profile.apexY, t),
    innerHalfGap: evalTriplet(
      profile.innerHalfGapShoulder,
      profile.innerHalfGapMid,
      profile.innerHalfGapApex,
      t,
    ),
    outerReach: evalTriplet(
      profile.outerReachShoulder,
      profile.outerReachMid,
      profile.outerReachApex,
      t,
    ),
  };
}

function evalWingPlanform(profile, side, armT, spanT) {
  const s = clamp01(spanT);
  const {
    y: baseY,
    innerHalfGap,
    outerReach,
    shoulderT,
    apexT,
  } = evalWingRails(profile, armT);

  const outerBias = THREE.MathUtils.smoothstep(0.28, 1.0, s);
  const innerBias = 1 - THREE.MathUtils.smoothstep(0.0, 0.24, s);

  let xMag = THREE.MathUtils.lerp(innerHalfGap, outerReach, s);
  xMag += outerBias * shoulderT * profile.shoulderFlare;
  xMag -= outerBias * apexT * profile.apexPinch;
  xMag +=
    innerBias * (profile.seamCompression + profile.seamCompression * shoulderT);

  let y = baseY;
  y += outerBias * shoulderT * profile.outerShoulderLift;
  y -= innerBias * shoulderT * profile.innerShoulderDrop;
  y -= outerBias * apexT * profile.apexDrop;

  return {
    x: side * xMag,
    y,
    shoulderT,
    apexT,
  };
}

function evalWingDepth(profile, armT, spanT, isFront) {
  const t = clamp01(armT);
  const s = clamp01(spanT);
  const shoulderT = 1 - THREE.MathUtils.smoothstep(t, 0.18, 0.9);
  const apexT = THREE.MathUtils.smoothstep(t, 0.58, 1.0);

  if (isFront) {
    const inner = THREE.MathUtils.lerp(
      profile.frontInnerShoulder,
      profile.frontInnerApex,
      t,
    );
    const outer = THREE.MathUtils.lerp(
      profile.frontOuterShoulder,
      profile.frontOuterApex,
      t,
    );

    let z = THREE.MathUtils.lerp(inner, outer, Math.pow(s, 0.9));
    z += shoulderT * Math.pow(s, 1.4) * profile.frontShoulderLift;
    z -= apexT * (profile.frontApexCut + 0.02 * s);
    return z;
  }

  const inner = THREE.MathUtils.lerp(
    profile.backInnerShoulder,
    profile.backInnerApex,
    t,
  );
  const outer = THREE.MathUtils.lerp(
    profile.backOuterShoulder,
    profile.backOuterApex,
    t,
  );

  let z = THREE.MathUtils.lerp(inner, outer, Math.pow(s, 1.05));
  z += shoulderT * Math.pow(s, 1.2) * profile.backShoulderPush;
  z += apexT * profile.backApexRelease;
  return z;
}

function evalSeamPlanform(profile, side, armT, seamSpanT) {
  const s = clamp01(seamSpanT);
  const bandSpan = profile.seamBandWidth * s;

  const base = evalWingPlanform(profile, side, armT, bandSpan);
  const inset =
    -side *
    (profile.seamInsetBase + profile.seamInsetShoulder * base.shoulderT) *
    (1 - s);

  return {
    x: base.x + inset,
    y: base.y,
    shoulderT: base.shoulderT,
    apexT: base.apexT,
  };
}

function evalSeamDepth(profile, armT, seamSpanT, isFront) {
  const t = clamp01(armT);
  const s = clamp01(seamSpanT);
  const shoulderT = 1 - THREE.MathUtils.smoothstep(t, 0.18, 0.9);
  const apexT = THREE.MathUtils.smoothstep(t, 0.58, 1.0);

  if (isFront) {
    const inner = THREE.MathUtils.lerp(
      profile.seamFrontInnerShoulder,
      profile.seamFrontInnerApex,
      t,
    );
    const outer = THREE.MathUtils.lerp(
      profile.seamFrontOuterShoulder,
      profile.seamFrontOuterApex,
      t,
    );

    let z = THREE.MathUtils.lerp(inner, outer, s);
    z += shoulderT * (1 - s) * profile.seamFrontShoulderLift;
    z -= apexT * profile.seamFrontApexCut;
    return z;
  }

  return -THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(
      Math.abs(profile.seamBackInnerShoulder),
      Math.abs(profile.seamBackInnerApex),
      t,
    ),
    THREE.MathUtils.lerp(
      Math.abs(profile.seamBackOuterShoulder),
      Math.abs(profile.seamBackOuterApex),
      t,
    ),
    s,
  );
}

function buildWingMassGeometry(profile, side) {
  const rows = profile.rows;
  const cols = profile.cols;

  const positions = [];
  const indices = [];

  const frontGrid = Array.from({ length: rows }, () => new Array(cols));
  const backGrid = Array.from({ length: rows }, () => new Array(cols));

  const pushVertex = (x, y, z) => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    return idx;
  };

  for (let r = 0; r < rows; r++) {
    const armT = r / (rows - 1);
    const massInnerSpan = evalMassInnerSpan(profile, armT);

    for (let c = 0; c < cols; c++) {
      const spanT = evalSpanRange(
        massInnerSpan,
        1.0,
        c / (cols - 1),
      );

      const plan = evalWingPlanform(profile, side, armT, spanT);
      const frontZ = evalWingDepth(profile, armT, spanT, true);
      const backZ = evalWingDepth(profile, armT, spanT, false);

      frontGrid[r][c] = pushVertex(plan.x, plan.y, frontZ);
      backGrid[r][c] = pushVertex(plan.x, plan.y, backZ);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      appendQuad(
        indices,
        frontGrid[r][c],
        frontGrid[r][c + 1],
        frontGrid[r + 1][c + 1],
        frontGrid[r + 1][c],
        side > 0,
      );
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      appendQuad(
        indices,
        backGrid[r][c],
        backGrid[r + 1][c],
        backGrid[r + 1][c + 1],
        backGrid[r][c + 1],
        side > 0,
      );
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    appendQuad(
      indices,
      frontGrid[r][cols - 1],
      backGrid[r][cols - 1],
      backGrid[r + 1][cols - 1],
      frontGrid[r + 1][cols - 1],
      side > 0,
    );
  }

  // Keep the inner seam and apex open so the center reads as negative space.
  for (let c = 0; c < cols - 1; c++) {
    appendQuad(
      indices,
      backGrid[0][c],
      backGrid[0][c + 1],
      frontGrid[0][c + 1],
      frontGrid[0][c],
      side > 0,
    );
  }

  return finalizeGeometry(positions, indices);
}

function buildWingSeamGeometry(profile, side) {
  const rows = profile.rows;
  const cols = profile.edgeCols;

  const positions = [];
  const indices = [];

  const frontGrid = Array.from({ length: rows }, () => new Array(cols));
  const backGrid = Array.from({ length: rows }, () => new Array(cols));

  const pushVertex = (x, y, z) => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    return idx;
  };

  for (let r = 0; r < rows; r++) {
    const armT = r / (rows - 1);

    for (let c = 0; c < cols; c++) {
      const seamSpanT = c / (cols - 1);

      const plan = evalSeamPlanform(profile, side, armT, seamSpanT);
      const frontZ = evalSeamDepth(profile, armT, seamSpanT, true);
      const backZ = evalSeamDepth(profile, armT, seamSpanT, false);

      frontGrid[r][c] = pushVertex(plan.x, plan.y, frontZ);
      backGrid[r][c] = pushVertex(plan.x, plan.y, backZ);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      appendQuad(
        indices,
        frontGrid[r][c],
        frontGrid[r][c + 1],
        frontGrid[r + 1][c + 1],
        frontGrid[r + 1][c],
        side > 0,
      );
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      appendQuad(
        indices,
        backGrid[r][c],
        backGrid[r + 1][c],
        backGrid[r + 1][c + 1],
        backGrid[r][c + 1],
        side > 0,
      );
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    appendQuad(
      indices,
      frontGrid[r][cols - 1],
      backGrid[r][cols - 1],
      backGrid[r + 1][cols - 1],
      frontGrid[r + 1][cols - 1],
      side > 0,
    );
  }

  // This seam is a surface accent, not a closed insert.
  for (let c = 0; c < cols - 1; c++) {
    appendQuad(
      indices,
      backGrid[0][c],
      backGrid[0][c + 1],
      frontGrid[0][c + 1],
      frontGrid[0][c],
      side > 0,
    );
  }

  return finalizeGeometry(positions, indices);
}

function resolveAnchorRoot(app) {
  return (
    app?.heroVShellAnchorRoot ||
    app?.shellAnchorRoot ||
    app?.particleRenderer?.object?.parent ||
    app?.particleRenderer?.object ||
    null
  );
}

function resolveHeroCenter(app) {
  return app?.mlsMpmSim?.uniforms?.heroCenter?.value || null;
}

export function createHeroVVisualShell() {
  const H = HERO_POINT_CLOUD;
  const profile = SHELL_PROFILE;

  const group = new THREE.Group();
  group.name = "HeroVVisualShell";
  group.frustumCulled = false;
  group.matrixAutoUpdate = true;
  group.visible = false;

  const shellLocalRoot = new THREE.Group();
  shellLocalRoot.name = "HeroVVisualShellLocalRoot";
  shellLocalRoot.frustumCulled = false;
  group.add(shellLocalRoot);

  const shellLocalOffset = new THREE.Vector3(
    H.centerX ?? 0,
    H.centerY ?? 0,
    H.centerZ ?? 0,
  );

  const massMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x9d7b63),
    roughness: 0.24,
    metalness: 0.46,
    envMapIntensity: 2.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    emissive: new THREE.Color(0x4f1808),
    emissiveIntensity: 0,
    side: THREE.FrontSide,
  });

  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf1a24f),
    roughness: 0.16,
    metalness: 0.08,
    envMapIntensity: 2.35,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    emissive: new THREE.Color(0xff6a1a),
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide,
  });

  const rightMassGeometry = buildWingMassGeometry(profile, 1);
  const leftMassGeometry = buildWingMassGeometry(profile, -1);
  const rightEdgeGeometry = buildWingSeamGeometry(profile, 1);
  const leftEdgeGeometry = buildWingSeamGeometry(profile, -1);

  const rightMass = new THREE.Mesh(rightMassGeometry, massMaterial);
  rightMass.name = "HeroVShellMassRight";
  rightMass.renderOrder = MASS_RENDER_ORDER;
  rightMass.frustumCulled = false;

  const leftMass = new THREE.Mesh(leftMassGeometry, massMaterial);
  leftMass.name = "HeroVShellMassLeft";
  leftMass.renderOrder = MASS_RENDER_ORDER;
  leftMass.frustumCulled = false;

  const rightEdge = new THREE.Mesh(rightEdgeGeometry, edgeMaterial);
  rightEdge.name = "HeroVShellEdgeRight";
  rightEdge.renderOrder = EDGE_RENDER_ORDER;
  rightEdge.frustumCulled = false;

  const leftEdge = new THREE.Mesh(leftEdgeGeometry, edgeMaterial);
  leftEdge.name = "HeroVShellEdgeLeft";
  leftEdge.renderOrder = EDGE_RENDER_ORDER;
  leftEdge.frustumCulled = false;

  shellLocalRoot.add(rightMass, leftMass, rightEdge, leftEdge);

  const scratchShellMatrix = new THREE.Matrix4();
  const scratchAnchorInverse = new THREE.Matrix4();

  return {
    group,

    /**
     * Expected app shape:
     * {
     *   runtime?: { shellClaimT?: number; particleSurrenderT?: number },
     *   mlsMpmSim?: { uniforms?: { heroCenter?: { value: THREE.Vector3 } } },
     *   heroVShellAnchorRoot?: THREE.Object3D,
     *   shellAnchorRoot?: THREE.Object3D,
     *   particleRenderer?: { object?: THREE.Object3D }
     * }
     */
    update(app) {
      const pr = app?.particleRenderer?.object;
      const heroCenter = resolveHeroCenter(app);
      const anchorRoot = resolveAnchorRoot(app);

      if (!pr || !heroCenter || !anchorRoot) {
        group.visible = false;
        return;
      }

      pr.updateWorldMatrix(true, false);
      anchorRoot.updateWorldMatrix(true, false);

      scratchAnchorInverse.copy(anchorRoot.matrixWorld).invert();
      scratchShellMatrix.multiplyMatrices(scratchAnchorInverse, pr.matrixWorld);
      scratchShellMatrix.decompose(
        group.position,
        group.quaternion,
        group.scale,
      );

      shellLocalRoot.position.copy(heroCenter).add(shellLocalOffset);

      const rawClaimT = clamp01(app?.runtime?.shellClaimT ?? 0);
      const claimT = smooth01(rawClaimT);

      const shellOpacity = THREE.MathUtils.lerp(0.0, 1.0, claimT);
      const edgeOpacity = THREE.MathUtils.lerp(0.0, 0.98, claimT);
      const edgeEmissive = THREE.MathUtils.lerp(0.0, 0.72, claimT);
      const massEmissive = THREE.MathUtils.lerp(0.0, 0.18, claimT);

      massMaterial.opacity = shellOpacity;
      massMaterial.emissiveIntensity = massEmissive;
      massMaterial.depthWrite = claimT > 0.2;

      edgeMaterial.opacity = edgeOpacity;
      edgeMaterial.emissiveIntensity = edgeEmissive;
      edgeMaterial.depthWrite = claimT > 0.2;

      const localResolveScale = THREE.MathUtils.lerp(
        profile.resolveScaleStart,
        1.0,
        claimT,
      );
      shellLocalRoot.scale.setScalar(localResolveScale);

      group.visible = claimT > 0.002;

      void app?.runtime?.particleSurrenderT;
    },

    dispose() {
      rightMassGeometry.dispose();
      leftMassGeometry.dispose();
      rightEdgeGeometry.dispose();
      leftEdgeGeometry.dispose();
      massMaterial.dispose();
      edgeMaterial.dispose();
      group.clear();
    },
  };
}
