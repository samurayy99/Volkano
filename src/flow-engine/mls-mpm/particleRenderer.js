import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  vec3,
  float,
  varying,
  instanceIndex,
  mix,
  normalize,
  cross,
  mat3,
  normalLocal,
  transformNormalToView,
  mrt,
  uniform,
  smoothstep,
  pow,
  fract,
  sin,
  step,
  max,
} from "three/tsl";

const PARTICLE_PROFILE_READ = Object.freeze({
  speedBandStart: 1.2,
  speedBandEnd: 3.5,
  stretchGain: 1.2,
  stretchBias: 1.0,
  thinningPower: -0.4,
  freezeBandStart: 0.18,
  freezeBandEnd: 0.82,
  frozenWidth: 1.0,
  frozenHeight: 1.45,
  frozenLength: 0.34,
  densityLift: 0.28,
  densityBias: 0.72,
  frozenDensity: 0.975,
  instanceScale: 1.08,
  preEnterSpeedStart: 0.16,
  preEnterSpeedEnd: 1.32,
  preEnterThicknessGain: 0.72,
  preEnterThicknessBias: 0.28,
});

const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const ww = vec3(normalize(target)).toVar();
  const upY = vec3(0, 1, 0).toConst("upY");
  const upX = vec3(1, 0, 0).toConst("upX");
  const yAbs = pow(ww.y.mul(ww.y), float(0.5)).toConst("yAbs");
  const refUp = mix(upY, upX, step(float(0.92), yAbs)).toConst("refUp");
  const uu = vec3(normalize(cross(refUp, ww))).toVar();
  const vv = vec3(normalize(cross(ww, uu))).toVar();
  return mat3(uu, vv, ww);
}).setLayout({
  name: "calcLookAtMatrix",
  type: "mat3",
  inputs: [{ name: "direction", type: "vec3" }],
});

const buildParticleProfileState = ({
  speed,
  particleDensity,
  convergenceFreeze,
}) => {
  const stretch = smoothstep(
    float(PARTICLE_PROFILE_READ.speedBandStart),
    float(PARTICLE_PROFILE_READ.speedBandEnd),
    speed,
  )
    .mul(PARTICLE_PROFILE_READ.stretchGain)
    .add(PARTICLE_PROFILE_READ.stretchBias)
    .toConst("stretch");

  const thinning = pow(
    stretch,
    float(PARTICLE_PROFILE_READ.thinningPower),
  ).toConst("thinning");

  const freezeShapeT = smoothstep(
    float(PARTICLE_PROFILE_READ.freezeBandStart),
    float(PARTICLE_PROFILE_READ.freezeBandEnd),
    convergenceFreeze.toConst("shapeFrozenT"),
  ).toConst("freezeShapeT");

  const rodWidth = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenWidth),
    freezeShapeT,
  ).toConst("rodWidth");

  const rodHeight = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenHeight),
    freezeShapeT,
  ).toConst("rodHeight");

  const rodLength = mix(
    stretch,
    float(PARTICLE_PROFILE_READ.frozenLength),
    freezeShapeT,
  ).toConst("rodLength");

  const densityScale = mix(
    particleDensity
      .mul(PARTICLE_PROFILE_READ.densityLift)
      .add(PARTICLE_PROFILE_READ.densityBias)
      .clamp(0, 1),
    float(PARTICLE_PROFILE_READ.frozenDensity),
    freezeShapeT,
  ).toConst("densityScale");

  return { rodWidth, rodHeight, rodLength, densityScale };
};

const buildParticleViewState = ({
  formedDir,
  speed,
  vNormalView,
  vPreEnterThickness,
}) => {
  const mat = calcLookAtMatrix(formedDir);

  const orientedNormalView = normalize(
    transformNormalToView(mat.mul(normalLocal)),
  ).toConst("orientedNormalView");

  const preEnterThickness = orientedNormalView.z
    .abs()
    .oneMinus()
    .mul(
      smoothstep(
        float(PARTICLE_PROFILE_READ.preEnterSpeedStart),
        float(PARTICLE_PROFILE_READ.preEnterSpeedEnd),
        speed,
      )
        .toConst("preEnterSpeedT")
        .mul(PARTICLE_PROFILE_READ.preEnterThicknessGain)
        .add(PARTICLE_PROFILE_READ.preEnterThicknessBias),
    )
    .clamp(0, 1)
    .toConst("preEnterThickness");

  vNormalView.assign(orientedNormalView);
  vPreEnterThickness.assign(preEnterThickness);

  return { mat };
};

const buildUnifiedParticleSurfaceNodes = ({
  particle,
  material,
  vNormalView,
  vPreEnterThickness,
  vOpacityMul,
}) => {
  const particleHeat = particle.get("heat");
  const particleColor = particle.get("color").toConst("particleColor");
  const viewNormal = normalize(vNormalView).toConst("viewNormal");
  const viewFacingT = viewNormal.z.abs().clamp(0, 1).toConst("viewFacingT");

  const viewThicknessT = vPreEnterThickness.clamp(0, 1).toConst("viewThicknessT");

  const roughNoise = fract(sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3))
    .mul(0.12)
    .sub(0.06)
    .toConst("roughNoise");

  const surfaceRoughness = float(0.92)
    .add(roughNoise)
    .clamp(0.86, 0.96)
    .sub(viewThicknessT.mul(0.075))
    .sub(viewFacingT.mul(viewThicknessT).mul(0.02))
    .clamp(0.8, 0.96)
    .toConst("surfaceRoughness");

  const glowFactor = smoothstep(float(0.12), float(0.46), particleHeat).toConst(
    "glowFactor",
  );

  const surfaceEmissive = vec3(0.36, 0.12, 0.03)
    .mul(glowFactor)
    .mul(float(0.012))
    .toConst("surfaceEmissive");

  const surfaceAo = mix(float(1.0), float(0.92), viewThicknessT)
    .add(viewThicknessT.mul(0.02))
    .clamp(0, 1)
    .toConst("surfaceAo");

  const opacityEffective = vOpacityMul.clamp(0, 1).toConst("opacityEffective");

  material.colorNode = particleColor;
  material.roughnessNode = surfaceRoughness;
  material.metalnessNode = float(0.015);
  material.emissiveNode = surfaceEmissive;
  material.aoNode = surfaceAo;
  material.opacityNode = opacityEffective;

  material.mrtNode = mrt({
    bloomIntensity: smoothstep(
      float(0.004),
      float(0.035),
      surfaceEmissive.r.max(surfaceEmissive.g).max(surfaceEmissive.b),
    )
      .mul(surfaceEmissive.r.max(surfaceEmissive.g).max(surfaceEmissive.b))
      .mul(opacityEffective)
      .clamp(0, 1),
  });
};

const buildParticlePositionNode = ({
  particle,
  uniforms,
  sizeUniform,
  vNormalView,
  vPreEnterThickness,
  vOpacityMul,
}) =>
  Fn(() => {
    const simPos = particle.get("position").xyz.toConst("simPos");
    const particleDensity = particle.get("density");
    const particleDirection = particle.get("direction");
    const localPos = attribute("position").xyz;
    const speed = particle.get("velocity").length();

    const particleProfile = buildParticleProfileState({
      speed,
      particleDensity,
      convergenceFreeze: uniforms.convergenceFreeze,
    });

    const formedDir = normalize(particleDirection.xyz).toConst("formedDir");
    const shapedPos = vec3(
      localPos.x.mul(particleProfile.rodWidth),
      localPos.y.mul(particleProfile.rodHeight),
      localPos.z.mul(particleProfile.rodLength),
    ).toConst("shapedPos");

    const viewState = buildParticleViewState({
      formedDir,
      speed,
      vNormalView,
      vPreEnterThickness,
    });

    vOpacityMul.assign(uniforms.bodyOpacityMul.clamp(0, 1));

    return viewState.mat
      .mul(
        shapedPos.mul(sizeUniform.mul(PARTICLE_PROFILE_READ.instanceScale)),
      )
      .mul(particleProfile.densityScale)
      .add(simPos);
  })();

const createRoundedBox = (width, height, depth, radius) => {
  const box = new THREE.BoxGeometry(
    width - radius * 2,
    height - radius * 2,
    depth - radius * 2,
  );
  const epsilon = Math.min(width, height, depth) * 0.01;
  const positionArray = box.attributes.position.array;
  const normalArray = box.attributes.normal.array;
  const indices = [...box.getIndex().array];
  const vertices = [];
  const posMap = {};
  const edgeMap = {};

  for (let i = 0; i < positionArray.length / 3; i++) {
    const oldPosition = new THREE.Vector3(
      positionArray[i * 3],
      positionArray[i * 3 + 1],
      positionArray[i * 3 + 2],
    );

    positionArray[i * 3 + 0] += normalArray[i * 3 + 0] * radius;
    positionArray[i * 3 + 1] += normalArray[i * 3 + 1] * radius;
    positionArray[i * 3 + 2] += normalArray[i * 3 + 2] * radius;

    const vertex = new THREE.Vector3(
      positionArray[i * 3],
      positionArray[i * 3 + 1],
      positionArray[i * 3 + 2],
    );
    vertex.normal = new THREE.Vector3(
      normalArray[i * 3],
      normalArray[i * 3 + 1],
      normalArray[i * 3 + 2],
    );
    vertex.id = i;
    vertex.faces = [];
    vertex.posHash = oldPosition
      .toArray()
      .map((v) => Math.round(v / epsilon))
      .join("_");

    posMap[vertex.posHash] = [...(posMap[vertex.posHash] || []), vertex];
    vertices.push(vertex);
  }

  vertices.forEach((vertex) => {
    const face = vertex.normal
      .toArray()
      .map((v) => Math.round(v))
      .join("_");
    vertex.face = face;
    posMap[vertex.posHash].forEach((v) => {
      v.faces.push(face);
    });
  });

  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (entry) => {
      edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
    };

    vertex.faces.sort();
    const f0 = vertex.faces[0];
    const f1 = vertex.faces[1];
    const f2 = vertex.faces[2];
    const face = vertex.face;

    if (f0 === face || f1 === face) addVertexToEdgeMap(`${f0}_${f1}`);
    if (f0 === face || f2 === face) addVertexToEdgeMap(`${f0}_${f2}`);
    if (f1 === face || f2 === face) addVertexToEdgeMap(`${f1}_${f2}`);
  });

  const addFace = (v0, v1, v2) => {
    const a = v1.clone().sub(v0);
    const b = v2.clone().sub(v0);
    if (a.cross(b).dot(v0) > 0) {
      indices.push(v0.id, v1.id, v2.id);
    } else {
      indices.push(v0.id, v2.id, v1.id);
    }
  };

  Object.keys(posMap).forEach((key) => {
    addFace(...posMap[key]);
  });

  Object.keys(edgeMap).forEach((key) => {
    const edgeVertices = edgeMap[key];
    const v0 = edgeVertices[0];
    edgeVertices.sort((v1, v2) => v1.distanceTo(v0) - v2.distanceTo(v0));
    addFace(...edgeVertices.slice(0, 3));
    addFace(...edgeVertices.slice(1, 4));
  });

  box.setIndex(indices);
  return box;
};

let particleGeometryTemplate = null;
const getParticleGeometryTemplate = () =>
  particleGeometryTemplate ??
  (particleGeometryTemplate = createRoundedBox(0.7, 0.7, 3, 0.1));

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  geometry = null;
  material = null;
  uniforms = {};

  runtime = {
    particles: 8192 * 4,
    actualSize: (1.6 / Math.pow(4, 1 / 3)) * 0.68,
    convergenceFreeze: 0,
  };

  constructor(mlsMpmSim) {
    this.mlsMpmSim = mlsMpmSim;

    this.geometry = new THREE.InstancedBufferGeometry().copy(
      getParticleGeometryTemplate(),
    );
    this.geometry.instanceCount = this.mlsMpmSim.numParticles;

    this.material = new THREE.MeshStandardNodeMaterial({
      metalness: 0.015,
      roughness: 0.92,
      transparent: true,
      depthWrite: true,
    });

    this.uniforms.size = uniform(1);
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.bodyOpacityMul = uniform(1);

    this._worldQuaternion = new THREE.Quaternion();
    this._worldScale = new THREE.Vector3();

    const vNormalView = varying(vec3(0), "vNormalView");
    const vPreEnterThickness = varying(0, "vPreEnterThickness");
    const vOpacityMul = varying(1, "vOpacityMul");
    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);

    this.material.positionNode = buildParticlePositionNode({
      particle,
      uniforms: this.uniforms,
      sizeUniform: this.uniforms.size,
      vNormalView,
      vPreEnterThickness,
      vOpacityMul,
    });

    buildUnifiedParticleSurfaceNodes({
      particle,
      material: this.material,
      vNormalView,
      vPreEnterThickness,
      vOpacityMul,
    });

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.frustumCulled = false;

    const s = 1 / 64;
    this.object.position.set(-32.0 * s * 1.6, -0.012, -0.12);
    this.object.rotation.x = 0.004;
    this.object.rotation.y = -0.04;
    this.object.rotation.z = -0.01;
    this.object.scale.set(s * 1.6, s * 0.88, s * 1.1);
    this.object.castShadow = true;
    this.object.receiveShadow = true;
  }

  worldPointToSimulation(worldPoint, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return this.object.worldToLocal(target.copy(worldPoint));
  }

  worldDirectionToSimulation(worldDirection, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    const worldQuaternion = this.object.getWorldQuaternion(
      this._worldQuaternion,
    );
    const worldScale = this.object.getWorldScale(this._worldScale);

    target
      .copy(worldDirection)
      .applyQuaternion(worldQuaternion.invert())
      .set(
        target.x / Math.max(worldScale.x, 0.0001),
        target.y / Math.max(worldScale.y, 0.0001),
        target.z / Math.max(worldScale.z, 0.0001),
      )
      .normalize();

    return target;
  }

  /** @param {number} bodyOpacityMul */
  applyPostEnterFrame(bodyOpacityMul = 1) {
    this.uniforms.bodyOpacityMul.value = Number.isFinite(bodyOpacityMul)
      ? bodyOpacityMul
      : 1;
  }

  applyRuntime(runtime) {
    if (runtime) this.runtime = runtime;
  }

  updateRuntimeUniforms() {
    this.uniforms.size.value = this.runtime.actualSize;
    this.uniforms.convergenceFreeze.value = this.runtime.convergenceFreeze;
    this.material.envMapIntensity = 0.12;

    // Stable policy: keep depthWrite on to reduce layer mush with transparency.
    this.material.transparent = true;
    this.material.depthWrite = true;

    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.visible = true;
  }

  dispose() {
    if (this.object?.parent) {
      this.object.parent.remove(this.object);
    }

    this.object = null;
    this.geometry?.dispose?.();
    this.material?.dispose?.();
    this.geometry = null;
    this.material = null;
    this.mlsMpmSim = null;
    this.uniforms = {};
  }

  update() {
    this.updateRuntimeUniforms();
    this.geometry.instanceCount = this.runtime.particles;
  }
}

export default ParticleRenderer;
