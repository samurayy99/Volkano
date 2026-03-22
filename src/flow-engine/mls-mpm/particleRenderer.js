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

      // Pass to fragment shader
      vSeamY.assign(seamY);
      vSettled.assign(materialSettle);
      vGrounding.assign(convergenceGrounding);
      vCrustBody.assign(crustBody);
      vCrustHeat.assign(crustHeat);
      vCrustShadow.assign(crustShadow);

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
        .mul(seamScale)
        .add(vec3(seamX, seamY, seamZ));
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
    this.material.colorNode = surfaceColor;
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
    this.material.emissiveNode = surfaceColor
      .mul(glowFactor)
      .mul(0.34)
      .add(ember.mul(seamGlow.add(bodyEmber).add(crustEmber)));
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
