import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  triNoise3D,
  time,
  vec3,
  vec4,
  float,
  varying,
  instanceIndex,
  mix,
  normalize,
  cross,
  mat3,
  normalLocal,
  transformNormalToView,
  mx_hsvtorgb,
  mrt,
  uniform,
  smoothstep,
  pow,
} from "three/tsl";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { conf } from "../conf";

export const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const rr = vec3(0, 0, 1.0).toVar();
  const ww = vec3(normalize(target)).toVar();
  const uu = vec3(normalize(cross(ww, rr)).negate()).toVar();
  const vv = vec3(normalize(cross(uu, ww)).negate()).toVar();

  return mat3(uu, vv, ww);
}).setLayout({
  name: "calcLookAtMatrix",
  type: "mat3",
  inputs: [{ name: "direction", type: "vec3" }],
});

const createRoundedBox = (width, height, depth, radius) => {
  //completely overengineered late night programming lol
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
    posMap[vertex.posHash].forEach((vertex) => {
      vertex.faces.push(face);
    });
  });
  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (vertex, entry) => {
      edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
    };
    vertex.faces.sort();
    const f0 = vertex.faces[0];
    const f1 = vertex.faces[1];
    const f2 = vertex.faces[2];
    const face = vertex.face;
    if (f0 === face || f1 === face) addVertexToEdgeMap(vertex, f0 + "_" + f1);
    if (f0 === face || f2 === face) addVertexToEdgeMap(vertex, f0 + "_" + f2);
    if (f1 === face || f2 === face) addVertexToEdgeMap(vertex, f1 + "_" + f2);
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

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  bloom = false;
  uniforms = {};

  constructor(mlsMpmSim) {
    this.mlsMpmSim = mlsMpmSim;

    /*const box = new THREE.BoxGeometry(0.7, 0.7,3);
        const cone = new THREE.ConeGeometry( 0.5, 3.0, 8 );
        cone.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI* 0.5, 0, 0)))
        this.geometry =  new THREE.InstancedBufferGeometry().copy(cone);
        console.log(this.geometry);*/

    //const sphereGeometry = BufferGeometryUtils.mergeVertices(new THREE.IcosahedronGeometry(0.5, 1));
    const boxGeometry = BufferGeometryUtils.mergeVertices(
      new THREE.BoxGeometry(7, 7, 30),
      3.0,
    );
    boxGeometry.attributes.position.array =
      boxGeometry.attributes.position.array.map((v) => v * 0.1);
    const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1); //BufferGeometryUtils.mergeVertices(new RoundedBoxGeometry(0.7,0.7,3,1,0.1));

    this.defaultIndexCount = roundedBoxGeometry.index.count;
    this.shadowIndexCount = boxGeometry.index.count;

    const mergedGeometry = BufferGeometryUtils.mergeGeometries([
      roundedBoxGeometry,
      boxGeometry,
    ]);

    this.geometry = new THREE.InstancedBufferGeometry().copy(mergedGeometry);

    this.geometry.setDrawRange(0, this.defaultIndexCount);
    this.geometry.instanceCount = this.mlsMpmSim.numParticles;

    this.material = new THREE.MeshStandardNodeMaterial({
      metalness: 0.08,
      roughness: 0.85,
    });

    this.uniforms.size = uniform(1);
    const vAo = varying(0, "vAo");
    const vNormal = varying(vec3(0), "v_normalView");
    this.uniforms.proofLock = uniform(0);
    this.uniforms.condensation = uniform(0);
    this.uniforms.seamSettle = uniform(0);
    this.uniforms.convergenceSettle = uniform(0);
    this.uniforms.seamCenterX = uniform(27.0);
    this.uniforms.seamCenterZ = uniform(22.0);
    this.uniforms.seamPocketCenter = uniform(new THREE.Vector3());
    this.uniforms.quietChamber = uniform(0);
    this.uniforms.seamAbsorption = uniform(0);
    this.uniforms.ventCenter = uniform(new THREE.Vector3());
    this.uniforms.collapseMix = uniform(0);
    this.uniforms.debugVis = uniform(0);
    const vDebugSettledFooting = varying(float(0), "vDebugSettledFooting");
    const vDebugSeamDist = varying(float(0), "vDebugSeamDist");
    const vAbsorptionProximity = varying(float(0), "vAbsorptionProximity");
    const vSeamY = varying(float(0), "vSeamY");
    const vSettled = varying(float(0), "vSettled");
    const vGrounding = varying(float(0), "vGrounding");
    const vCrustBody = varying(float(0), "vCrustBody");
    const vCrustHeat = varying(float(0), "vCrustHeat");
    const vCrustShadow = varying(float(0), "vCrustShadow");
    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
    this.material.positionNode = Fn(() => {
      const particlePosition = particle.get("position");
      const particleDensity = particle.get("density");
      const particleDirection = particle.get("direction");
      const particleCaptured = particle.get("captured");

      const localPos = attribute("position").xyz;
      const particleVelocity = particle.get("velocity");
      const speed = particleVelocity.length();

      // --- Floor resolve: solver owns the descent. Renderer only does minimal vertical cleanup. ---
      const seamFloorY = float(3.0);
      const floorBind = smoothstep(float(12.0), float(4.5), particlePosition.y);
      const finishY = this.uniforms.seamSettle
        .mul(floorBind)
        .mul(0.1)
        .clamp(0, 0.16);
      const convergenceGrounding = this.uniforms.convergenceSettle
        .mul(smoothstep(float(20.0), float(6.0), particlePosition.y))
        .clamp(0, 1);
      const materialSettle = convergenceGrounding
        .mul(0.42)
        .add(this.uniforms.seamSettle.mul(floorBind).mul(0.3))
        .clamp(0, 1);
      const settledFooting = materialSettle
        .mul(floorBind)
        .toConst("settledFooting");

      // Keep only slight organic variance. The floor body should read as settled matter,
      // not as a procedural lava terrain.
      const surfaceFieldPos = vec3(
        particlePosition.x.mul(0.046).add(4.1),
        particlePosition.z.mul(0.044).add(6.4),
        particlePosition.x.sub(particlePosition.z).mul(0.018).add(2.3),
      ).toConst("surfaceFieldPos");
      const surfaceNoise = triNoise3D(surfaceFieldPos, float(0), float(0))
        .sub(float(0.285))
        .toConst("surfaceNoise");
      const crustBody = smoothstep(float(-0.03), float(0.12), surfaceNoise)
        .mul(settledFooting)
        .toConst("crustBody");
      const crustHeat = smoothstep(float(0.11), float(0.17), surfaceNoise)
        .mul(crustBody)
        .toConst("crustHeat");
      const crustShadow = smoothstep(
        float(-0.02),
        float(0.1),
        surfaceNoise.negate(),
      )
        .mul(settledFooting)
        .toConst("crustShadow");
      const crustLift = crustBody
        .mul(0.028)
        .add(crustHeat.mul(0.018))
        .sub(crustShadow.mul(0.014))
        .toConst("crustLift");
      const crustBurial = settledFooting
        .mul(0.085)
        .add(crustShadow.mul(0.022))
        .sub(crustHeat.mul(0.01))
        .toConst("crustBurial");
      const seamY = mix(particlePosition.y, seamFloorY, finishY)
        .add(crustLift)
        .sub(crustBurial);

      // Velocity-stretch: settled particles become shorter, chunkier and more coherent.
      const stretchT = smoothstep(float(1.2), float(3.5), speed);
      const stretch = stretchT.mul(1.2).add(1.0);
      const thinning = pow(stretch, -0.4);
      const crustCompression = settledFooting
        .mul(0.96)
        .toConst("crustCompression");
      const widthScale = mix(
        thinning,
        float(1.04).add(crustBody.mul(0.05)),
        crustCompression,
      ).toConst("widthScale");
      const heightScale = mix(
        thinning,
        float(0.34).add(crustHeat.mul(0.03)).sub(crustShadow.mul(0.02)),
        crustCompression,
      ).toConst("heightScale");
      const lengthScale = mix(
        stretch,
        float(0.6).add(crustBody.mul(0.05)).add(crustHeat.mul(0.03)),
        crustCompression,
      ).toConst("lengthScale");
      const stretchedPos = vec3(
        localPos.x.mul(widthScale),
        localPos.y.mul(heightScale),
        localPos.z.mul(lengthScale),
      );

      // No horizontal pull — particles stay where they land
      const seamX = particlePosition.x;
      const seamZ = particlePosition.z;

      // Minimal straggler fade — only very high outliers
      const stragglerFade = this.uniforms.seamSettle
        .mul(smoothstep(float(24.0), float(34.0), particlePosition.y))
        .mul(0.12);
      const seamScale = float(1).sub(stragglerFade);
      const quietUncaptured = this.uniforms.quietChamber
        .mul(float(1).sub(particleCaptured.clamp(0, 1)))
        .toConst("quietUncaptured");
      // Rift absorption proximity — particles compress toward zero as they approach the vent
      const riftDx = particlePosition.x.sub(this.uniforms.ventCenter.x);
      const riftDy = particlePosition.y.sub(this.uniforms.ventCenter.y.sub(float(4.0)));
      const riftDz = particlePosition.z.sub(this.uniforms.ventCenter.z);
      const riftDistSq = riftDx.mul(riftDx).add(riftDy.mul(riftDy)).add(riftDz.mul(riftDz));
      const riftDist = riftDistSq.pow(0.5).max(float(0.01));
      // Expanding shrink wave (legacy — seamAbsorption=0 in collapse architecture, kept for compat)
      const shrinkWaveFront = this.uniforms.seamAbsorption.mul(30.0);
      const absorptionProximity = shrinkWaveFront
        .sub(riftDist)
        .div(float(6.0))
        .clamp(0, 1)
        .mul(this.uniforms.seamAbsorption)
        .toConst("absorptionProximity");
      vAbsorptionProximity.assign(absorptionProximity);
      const absorptionShrink = mix(
        float(1),
        float(0.0),
        pow(absorptionProximity, 1.8),
      ).toConst("absorptionShrink");

      // === COLLAPSE: "The Rift Drinks the Mass" ===
      // Two waves sweep from outer shell inward toward the rift:
      //   1. Thermal death wave (fast) — color goes to coal, outside-in
      //   2. Consumption wave (slower, trails behind) — particles pulled into rift
      // Sim stays frozen. Renderer owns all motion, shrink, and color.

      const cMix = this.uniforms.collapseMix;

      // Per-particle hash for organic edge jitter
      const particleHash = float(instanceIndex).add(1.0).mul(0.6180339887).fract()
        .toConst("particleHash");

      // Soft target spread: feed into a small spatial volume (crack area) instead of a singularity
      // This eliminates the "VFX traffic jam/funnel" at a single mathematical pixel.
      const targetSpreadX = particleHash.sub(0.5).mul(6.0); // ±3 units wide along the crack
      const targetSpreadY = particleHash.mul(17.3).fract().sub(0.5).mul(1.5); // ±0.75 units high
      const riftTarget = vec3(
        this.uniforms.ventCenter.x.add(targetSpreadX),
        this.uniforms.ventCenter.y.add(float(1.5)).add(targetSpreadY),
        this.uniforms.ventCenter.z.add(float(4.0))
      ).toConst("riftTarget");

      // Distance from rift (the drain)
      const toRift = riftTarget.sub(particlePosition);
      const riftDistC = toRift.length().max(float(0.5)).toConst("riftDistC");

      // Rift proximity: 1 = at rift, 0 = at outer shell (~28 units away)
      const riftProximity = float(1).sub(riftDistC.div(float(28.0)).clamp(0, 1))
        .toConst("riftProximity");

      // Safety gate: nothing happens at cMix=0
      const collapseGate = smoothstep(float(0.0), float(0.03), cMix)
        .toConst("collapseGate");

      // --- Wave 1: Thermal death (color only, fast) ---
      // Sweeps OUTSIDE→IN. Leads consumption slightly.
      const thermalWaveMix = cMix.mul(1.6).clamp(0, 1).toConst("thermalWaveMix");
      const thermalBand = float(8.0);
      // Wave must start at 65.0 to cover the furthest particles in the chamber.
      const thermalWaveFront = mix(float(65.0), thermalBand.negate(), thermalWaveMix)
        .toConst("thermalWaveFront");
      // Particle is thermally dead when riftDist > waveFront
      const thermalDeath = riftDistC.sub(thermalWaveFront)
        .add(particleHash.mul(3.0))  // ±3 unit jitter for organic edge
        .div(thermalBand)
        .clamp(0, 1)
        .mul(collapseGate)
        .toConst("thermalDeath");

      // --- Wave 2: Consumption (position + scale, slower) ---
      // Sweeps INSIDE→OUT (Erosion/Drain). Starts at cMix≈0.12, fully consumes at cMix=1.0
      // Linearize the cMix slightly to counteract the external ease-out (less whip-crack)
      const linearMix = pow(cMix, 1.5);
      const consumeWaveMix = linearMix.sub(0.12).mul(1.14).clamp(0, 1)
        .toConst("consumeWaveMix");
      
      // Distance-proportional suction: Far particles take much longer to be consumed.
      // This kills the "machine-gun" effect by giving outer particles a massive travel window,
      // equalizing the travel speed so all particles flow elegantly at the same pace.
      const baseBand = float(10.0);
      const consumeBand = baseBand.add(riftDistC.mul(1.2)).toConst("consumeBand");
      
      // Expanding from the rift (-baseBand) out to the farthest required distance (~120.0)
      const consumeWaveFront = mix(baseBand.negate(), float(130.0), consumeWaveMix)
        .toConst("consumeWaveFront");
      
      // consumeProgress: 0 = untouched, 1 = fully consumed (at rift)
      const consumeProgress = consumeWaveFront.sub(riftDistC)
        .add(particleHash.mul(4.0))  // subtle jitter for clean but organic stagger
        .div(consumeBand)
        .clamp(0, 1)
        .mul(collapseGate)
        .toConst("consumeProgress");

      // Scale: FULL SIZE during flight. Swallowed softly at the rift mouth.
      // Eased from 0.85 to 1.0 so particles don't all shoot in as massive blocks.
      const collapseShrink = float(1).sub(
        smoothstep(float(0.85), float(1.0), consumeProgress),
      ).toConst("collapseShrink");

      // Wave-front heat: particles briefly re-ignite as the wave grabs them.
      // Peaks at mid-consume (cp=0.5), creating a visible sweeping heat line.
      const waveFrontHeat = consumeProgress
        .mul(float(1).sub(consumeProgress)).mul(4.0)
        .clamp(0, 1).toConst("waveFrontHeat");

      // Fragment signal: alive-at-rift core + wave-front heat flash
      vAbsorptionProximity.assign(
        riftProximity.mul(float(1).sub(consumeProgress)).mul(cMix)
          .add(waveFrontHeat.mul(0.3).mul(collapseGate)),
      );

      // Position: softened ease-OUT.
      // Less brutal front-load than cp^2, giving thermal wave time to read visually.
      const oneMinusCp = float(1).sub(consumeProgress);
      const travelProgress = float(1).sub(pow(oneMinusCp, 1.6))
        .toConst("travelProgress");
      const collapseSqueezeBlend = travelProgress
        .toConst("collapseSqueezeBlend");

      const renderScale = seamScale
        .mul(float(1).sub(particleCaptured.clamp(0, 1)))
        .mul(pow(float(1).sub(quietUncaptured), 2.6))
        .mul(absorptionShrink)
        .mul(collapseShrink)
        .toConst("renderScale");
      const quietPocketTarget = vec3(
        this.uniforms.seamPocketCenter.x.add(
          particlePosition.x.sub(this.uniforms.seamCenterX).mul(0.08),
        ),
        this.uniforms.seamPocketCenter.y.add(
          particlePosition.y.sub(float(6.0)).mul(0.05),
        ),
        this.uniforms.seamPocketCenter.z.add(
          particlePosition.z.sub(this.uniforms.seamCenterZ).mul(0.08),
        ),
      ).toConst("quietPocketTarget");
      const basePosition = vec3(seamX, seamY, seamZ).toConst("basePosition");
      
      // We removed the Tornado Arc because particleHash disrupted the fluid body.
      // Reverted to a clean, straight positional ease towards the floating riftTarget.
      const collapsedPosition = mix(
        basePosition,
        riftTarget,
        collapseSqueezeBlend,
      ).toConst("collapsedPosition");
      const renderPosition = mix(
        collapsedPosition,
        quietPocketTarget,
        quietUncaptured.mul(0.92).clamp(0, 0.92),
      ).toConst("renderPosition");

      // Pass to fragment shader
      vSeamY.assign(seamY);
      vSettled.assign(materialSettle);
      vGrounding.assign(convergenceGrounding);
      vCrustBody.assign(crustBody);
      vCrustHeat.assign(crustHeat);
      vCrustShadow.assign(crustShadow);
      vDebugSettledFooting.assign(settledFooting);
      const debugSeamDx = particlePosition.x.sub(this.uniforms.seamCenterX);
      const debugSeamDz = particlePosition.z.sub(this.uniforms.seamCenterZ);
      vDebugSeamDist.assign(debugSeamDx.mul(debugSeamDx).add(debugSeamDz.mul(debugSeamDz)).pow(0.5));
      const settledDirection = normalize(
        vec3(surfaceNoise.mul(0.18), float(0.02), float(1.0)),
      ).toConst("settledDirection");
      const renderDirection = normalize(
        mix(
          particleDirection.xyz,
          settledDirection,
          crustCompression.mul(0.78),
        ),
      );
      const mat = calcLookAtMatrix(renderDirection);
      vNormal.assign(transformNormalToView(mat.mul(normalLocal)));
      vAo.assign(particlePosition.z.div(64));
      vAo.assign(
        vAo
          .mul(vAo)
          .oneMinus()
          .mul(float(1).sub(crustShadow.mul(0.08)))
          .add(crustBody.mul(0.03))
          .add(crustHeat.mul(0.03)),
      );
      const crustBulk = float(1)
        .add(crustBody.mul(0.02))
        .sub(crustShadow.mul(0.02))
        .toConst("crustBulk");
      return mat
        .mul(stretchedPos.mul(this.uniforms.size.mul(1.08)))
        .mul(crustBulk)
        .mul(particleDensity.mul(0.4).add(0.5).clamp(0, 1))
        .mul(renderScale)
        .add(renderPosition);
    })();
    const particleColor = particle.get("color");
    const particleDensity = particle.get("density");
    const particleHeat = particle.get("heat");
    const coal = vec3(0.012, 0.009, 0.008);
    const crustBodyColor = vec3(0.22, 0.055, 0.026);
    const crustEmberColor = vec3(0.42, 0.11, 0.035);
    // Minimal renderer darkening — simulator thermal extinction handles the real cooling.
    const proofDarken = vGrounding
      .mul(0.04)
      .add(vCrustShadow.mul(0.04))
      .add(this.uniforms.condensation.mul(vSettled).mul(0.05))
      .add(this.uniforms.seamSettle.mul(vSettled).mul(0.06))
      .clamp(0, 1)
      .toConst("proofDarken");
    // Collapse fragment: two-wave color system
    // vAbsorptionProximity = core alive signal + wave-front heat flash
    //   high = near rift alive OR at wave front (brief re-ignition)
    //   low = consumed or far from action
    const riftAliveSignal = vAbsorptionProximity;
    // Thermal death: outer particles darken to coal. Core resists strongly.
    const thermalDarken = smoothstep(float(0.0), float(0.4), this.uniforms.collapseMix)
      .mul(float(1).sub(riftAliveSignal.mul(0.7)))
      .clamp(0, 1)
      .toConst("thermalDarken");
    // Base re-heat + wave-front flash: visible heat during the consumption sweep
    const baseReHeat = riftAliveSignal
      .mul(smoothstep(float(0.1), float(0.35), this.uniforms.collapseMix))
      .mul(float(1).sub(smoothstep(float(0.85), float(1.0), this.uniforms.collapseMix)))
      .mul(0.6)
      .clamp(0, 0.6);
      
    // Signature re-ignition flash (Grok's must-have): late intense burst right before extinction
    const signatureFlash = riftAliveSignal
      .mul(smoothstep(float(0.78), float(0.92), this.uniforms.collapseMix))
      .mul(float(1).sub(smoothstep(float(0.93), float(1.0), this.uniforms.collapseMix)))
      .mul(1.8)
      .clamp(0, 1.0);

    const coreReHeat = baseReHeat.add(signatureFlash).clamp(0, 1.0).toConst("coreReHeat");
    // Final extinction: everything to coal at the very end
    const collapseExtinction = smoothstep(float(0.88), float(1.0), this.uniforms.collapseMix)
      .toConst("collapseExtinction");
    const darkenedColor = mix(particleColor, coal, proofDarken).toConst(
      "darkenedColor",
    );
    const crustToneLift = vCrustBody
      .mul(0.1)
      .add(vCrustHeat.mul(0.08))
      .sub(vCrustShadow.mul(0.03))
      .clamp(0, 0.14)
      .toConst("crustToneLift");
    const crustToneColor = mix(
      crustBodyColor,
      crustEmberColor,
      vCrustHeat.clamp(0, 1),
    ).toConst("crustToneColor");
    const readableColor = mix(
      darkenedColor,
      crustToneColor,
      crustToneLift,
    ).toConst("readableColor");
    const emberAccent = vCrustHeat
      .mul(0.18)
      .clamp(0, 0.18)
      .toConst("emberAccent");
    const surfaceColor = mix(
      readableColor,
      crustEmberColor,
      emberAccent,
    ).toConst("surfaceColor");
    // Debug visualization using mix/smoothstep (select() breaks WGSL)
    // debugVis: 0=off, 1=settledFooting, 2=raw heat, 3=seam proximity
    const debugSettledColor = vec3(vDebugSettledFooting, float(0), float(1).sub(vDebugSettledFooting));
    const debugHeatColor = vec3(particleHeat, particleHeat.mul(0.3), float(0));
    const debugSeamProx = smoothstep(float(18.0), float(1.0), vDebugSeamDist);
    const debugSeamColor = vec3(float(0), debugSeamProx, debugSeamProx.mul(0.5));
    // Weights that peak at 1, 2, 3 respectively using smoothstep pairs
    const dv = this.uniforms.debugVis;
    const w1 = smoothstep(float(0.5), float(1.0), dv).mul(smoothstep(float(1.5), float(1.0), dv));
    const w2 = smoothstep(float(1.5), float(2.0), dv).mul(smoothstep(float(2.5), float(2.0), dv));
    const w3 = smoothstep(float(2.5), float(3.0), dv);
    const debugColor = debugSettledColor.mul(w1).add(debugHeatColor.mul(w2)).add(debugSeamColor.mul(w3));
    const debugMix = smoothstep(float(0.3), float(0.7), dv);
    // Apply collapse: shell death → ember re-heat → final extinction
    const emberCore = vec3(0.58, 0.11, 0.025);
    const thermallyDead = mix(surfaceColor, coal, thermalDarken);
    const reheated = mix(thermallyDead, emberCore, coreReHeat);
    const collapsedColor = mix(reheated, coal, collapseExtinction).toConst("collapsedColor");
    this.material.colorNode = mix(collapsedColor, debugColor, debugMix);
    // Gentle glow suppression — only for settled particles during final cleanup.
    const glowSuppression = vGrounding
      .mul(0.24)
      .sub(vCrustBody.mul(0.04))
      .sub(vCrustHeat.mul(0.1))
      .add(vCrustShadow.mul(0.03))
      .add(this.uniforms.condensation.mul(vSettled).mul(0.03))
      .add(this.uniforms.seamSettle.mul(vSettled).mul(0.06))
      .clamp(0, 1)
      .toConst("glowSuppression");
    const glowFactor = smoothstep(float(0.18), float(0.52), particleHeat).mul(
      float(1).sub(glowSuppression),
    );
    // A faint late crack ember remains, but as a continuation of the same cooling curve.
    const ember = vec3(0.82, 0.12, 0.02);
    const seamProximity = smoothstep(float(10.0), float(4.0), vSeamY);
    const seamGlowIntensity = smoothstep(
      float(0.28),
      float(0.82),
      this.uniforms.convergenceSettle,
    )
      .mul(vGrounding)
      .mul(0.16)
      .add(vCrustHeat.mul(0.14))
      .add(
        smoothstep(float(0.6), float(1.0), this.uniforms.condensation).mul(
          0.18,
        ),
      )
      .add(this.uniforms.seamSettle.mul(0.12))
      .mul(vSettled)
      .clamp(0, 0.22);
    const crackIntensity = pow(particleDensity.clamp(0.0, 1.0), float(3.0));
    const seamGlow = seamProximity
      .mul(crackIntensity)
      .mul(seamGlowIntensity)
      .mul(0.1);
    const bodyEmber = vCrustBody
      .mul(vGrounding)
      .mul(float(1).sub(vCrustShadow.mul(0.65)))
      .mul(0.03)
      .toConst("bodyEmber");
    const crustEmber = vCrustHeat
      .mul(vSettled)
      .mul(vGrounding)
      .mul(0.06)
      .toConst("crustEmber");
    // Rift absorption glow — faint ember as particles approach the rift, readability aid not beauty
    const absorptionGlow = pow(vAbsorptionProximity, 2.0)
      .mul(0.12)
      .toConst("absorptionGlow");
    const normalEmissive = surfaceColor
      .mul(glowFactor)
      .mul(0.34)
      .add(ember.mul(seamGlow.add(bodyEmber).add(crustEmber).add(absorptionGlow)));
    // Quiet Afterglow: faint lingering heat after collapse (Grok)
    const quietAfterglow = this.uniforms.quietChamber
      .mul(0.25)
      .toConst("quietAfterglow");

    // Kill emissive during collapse, but leave faint residual chamber heat
    const collapseEmissive = mix(normalEmissive, vec3(0), collapseExtinction)
      .add(ember.mul(quietAfterglow.mul(0.15)));
    this.material.emissiveNode = mix(collapseEmissive, vec3(0), debugMix);
    const heatBloom = smoothstep(float(0.62), float(0.82), particleHeat);
    this._bloomIntensityNode = heatBloom;
    this.material.aoNode = vAo;

    //this.material.fragmentNode = vec4(0,0,0,1);
    //this.material.envNode = vec3(0.5);

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.onBeforeShadow = () => {
      this.geometry.setDrawRange(this.defaultIndexCount, Infinity);
    };
    this.object.onAfterShadow = () => {
      this.geometry.setDrawRange(0, this.defaultIndexCount);
    };

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
    target.copy(worldPoint);
    this.object.worldToLocal(target);
    // Lab shader has no SIM_RENDER_SCALE — identity (1,1,1)
    return target;
  }

  worldDirectionToSimulation(worldDirection, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    const worldQuaternion = this.object.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const worldScale = this.object.getWorldScale(new THREE.Vector3());
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

  update() {
    const { particles, bloom, actualSize } = conf;
    this.uniforms.size.value = actualSize;
    this.uniforms.proofLock.value = conf.proofLockMix;
    this.uniforms.condensation.value = conf.condensationMix;
    this.uniforms.seamSettle.value = conf.seamSettleMix;
    this.uniforms.convergenceSettle.value = conf.postFreezeSettleMix;
    const cx =
      (conf.sourceFieldCenter.x + conf.sourceFieldSecondaryCenter.x) * 0.5;
    const cz =
      (conf.sourceFieldCenter.z + conf.sourceFieldSecondaryCenter.z) * 0.5;
    this.uniforms.seamCenterX.value = cx;
    this.uniforms.seamCenterZ.value = cz;
    this.uniforms.seamPocketCenter.value.copy(conf.ventCenter).add(conf.seamPocketOffset);
    this.uniforms.quietChamber.value = conf.quietChamberMix || 0;
    this.uniforms.seamAbsorption.value = conf.seamAbsorption || 0;
    this.uniforms.collapseMix.value = conf.collapseMix || 0;
    this.uniforms.ventCenter.value.copy(conf.ventCenter);
    const debugMap = { settled: 1, heat: 2, seamPull: 3 };
    this.uniforms.debugVis.value = debugMap[conf.particleDebugMode] || 0;
    this.geometry.instanceCount = particles;

    if (bloom !== this.bloom) {
      this.bloom = bloom;
      if (bloom) {
        this.material.mrtNode = mrt({
          bloomIntensity: this._bloomIntensityNode,
        });
      } else {
        this.material.mrtNode = null;
      }
    }
  }
}
export default ParticleRenderer;
