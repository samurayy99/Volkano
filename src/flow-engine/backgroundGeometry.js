import * as THREE from "three/webgpu";
import { PREENTER_SOURCE_ANCHOR, PREENTER_VESSEL } from "./vesselDescriptors";

const NORMAL_MAP_URL = "/flow-assets/concrete_0016_normal_opengl_1k.png";
const COLOR_MAP_URL = "/flow-assets/concrete_0016_color_1k.jpg";
const ROUGHNESS_MAP_URL = "/flow-assets/concrete_0016_roughness_1k.jpg";
const BACK_PLATE_URL = "/images/rift-monolith.png";
const BACK_PLATE_SOURCE_OPACITY = 0.98;

const FRAME_BASE_COLOR = new THREE.Color(0x2d2a27);

const LINER_BASE_COLOR = new THREE.Color(0x1b1c1f);

const INTERIOR_SIDE_BASE_COLOR = new THREE.Color(0x232425);
const INTERIOR_WALL_BASE_COLORS = [
  INTERIOR_SIDE_BASE_COLOR,
  INTERIOR_SIDE_BASE_COLOR,
  new THREE.Color(0x1f2227),
  new THREE.Color(0x26211d),
];

const BACK_WALL_BASE_COLOR = new THREE.Color(0x101114);

const textureLoader = new THREE.TextureLoader();

const loadTexture = (file, { repeat = true, colorSpace = null } = {}) =>
  new Promise((resolve) => {
    textureLoader.load(
      file,
      (loadedTexture) => {
        loadedTexture.wrapS = repeat
          ? THREE.RepeatWrapping
          : THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = repeat
          ? THREE.RepeatWrapping
          : THREE.ClampToEdgeWrapping;
        if (colorSpace) {
          loadedTexture.colorSpace = colorSpace;
        }
        resolve(loadedTexture);
      },
      undefined,
      // Without this, a missing file never settles the promise: init() awaits it
      // forever, the app hangs in "probing", and the visitor gets a black screen
      // with a dead WAKE button — no error, no fallback, no state. A 404 must
      // degrade, not deadlock.
      (error) => {
        console.error(`[flow-engine] texture failed to load: ${file}`, error);
        resolve(null);
      },
    );
  });

const cloneTexture = (sourceTexture, repeatX = 1, repeatY = 1) => {
  const clonedTexture = sourceTexture.clone();
  clonedTexture.repeat.set(repeatX, repeatY);
  clonedTexture.needsUpdate = true;
  return clonedTexture;
};

const createStoneMaterial = ({
  mapTexture,
  normalTexture,
  roughnessTexture,
  color,
  emissive,
  normalScale = 0.22,
  roughness = 0.94,
  metalness = 0.04,
  envMapIntensity = 0.18,
  repeatX = 1.4,
  repeatY = 1.4,
  side = THREE.FrontSide,
}) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(emissive),
    emissiveIntensity: 0.02,
    map: cloneTexture(mapTexture, repeatX, repeatY),
    normalMap: cloneTexture(normalTexture, repeatX, repeatY),
    roughnessMap: cloneTexture(roughnessTexture, repeatX, repeatY),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness,
    metalness,
    envMapIntensity,
    side,
  });

const setTextureOffset = (material, offsetX = 0, offsetY = 0) => {
  if (material.map) {
    material.map.offset.set(offsetX, offsetY);
  }
  if (material.normalMap) {
    material.normalMap.offset.set(offsetX, offsetY);
  }
  if (material.roughnessMap) {
    material.roughnessMap.offset.set(offsetX, offsetY);
  }
};

const configureStaticMesh = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

class BackgroundGeometry {
  object = null;
  response = 0;
  frameMaterial = null;
  linerMaterial = null;
  backWallMaterial = null;
  backWall = null;
  backPlateMaterial = null;
  backPlate = null;
  interiorWallMaterials = [];
  sourceTextures = [];

  addImpulse(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.response = Math.min(1, this.response + amount);
  }

  getSourceAnchorDescriptorWorld() {
    if (!this.object) {
      return null;
    }

    this.object.updateWorldMatrix(true, false);

    const originLocal = PREENTER_SOURCE_ANCHOR.originLocal.clone();
    const axisLocal = PREENTER_SOURCE_ANCHOR.axisLocal.clone();

    const axisWorld = axisLocal
      .clone()
      .transformDirection(this.object.matrixWorld)
      .normalize();

    // Orthonormal basis: axis from authored vent direction; right/up derived (stable for rotated groups).
    const refUp = new THREE.Vector3(0, 1, 0);
    let rightWorld = new THREE.Vector3().crossVectors(refUp, axisWorld);
    if (rightWorld.lengthSq() < 1e-10) {
      refUp.set(1, 0, 0);
      rightWorld.crossVectors(refUp, axisWorld);
    }
    rightWorld.normalize();
    const upWorld = new THREE.Vector3()
      .crossVectors(axisWorld, rightWorld)
      .normalize();

    return {
      originLocal,
      axisLocal,
      radiiLocal: PREENTER_SOURCE_ANCHOR.radiiLocal.clone(),
      originWorld: this.object.localToWorld(originLocal.clone()),
      axisWorld,
      rightWorld,
      upWorld,
    };
  }

  getRiftFlightDescriptorWorld() {
    if (!this.object) {
      return null;
    }

    this.object.updateWorldMatrix(true, false);

    const { apertureHeight, depth } = PREENTER_VESSEL;
    const safeHalfHeight = apertureHeight * 0.46;
    // Active particle absorption must stay in front of the backplate. If the
    // flight target sits on the image plane, depth sorting reads as re-emission
    // from the wall instead of intake into the rift.
    const intakePlaneZ = depth - 0.22;

    return {
      minWorld: this.object.localToWorld(
        new THREE.Vector3(0, -safeHalfHeight, intakePlaneZ),
      ),
      maxWorld: this.object.localToWorld(
        new THREE.Vector3(0, safeHalfHeight, intakePlaneZ),
      ),
      centerWorld: this.object.localToWorld(
        new THREE.Vector3(0, 0, intakePlaneZ),
      ),
    };
  }

  setForensicPostEnterIsolation(mode) {
    if (!this.backPlate) return;
    this.backPlate.visible =
      mode !== "feedstockOnly" &&
      mode !== "particlesOnly" &&
      mode !== "rodsOnly";
  }

  update(delta) {
    const dt = Math.max(0, Math.min(0.1, delta || 0));
    this.response *= Math.exp(-dt / 0.09);
    if (this.response < 0.002) this.response = 0;

    const response = this.response;
    const frameBase = 0.018;
    const linerBase = 0.006;
    const backWallBase = 0.004;

    if (this.frameMaterial) {
      this.frameMaterial.color.copy(FRAME_BASE_COLOR);
      this.frameMaterial.envMapIntensity = 0.1;
      this.frameMaterial.emissiveIntensity = frameBase + response * 0.035;
    }

    if (this.linerMaterial) {
      this.linerMaterial.color.copy(LINER_BASE_COLOR);
      this.linerMaterial.envMapIntensity = 0.025;
      this.linerMaterial.emissiveIntensity = linerBase + response * 0.01;
    }

    const mats = this.interiorWallMaterials;
    const baseCols = INTERIOR_WALL_BASE_COLORS;
    for (let i = 0; i < mats.length; i++) {
      const material = mats[i];
      material.color.copy(baseCols[i]);
      material.envMapIntensity = 0.076;
      material.emissiveIntensity = 0.018;
    }

    if (this.backWallMaterial) {
      this.backWallMaterial.color.copy(BACK_WALL_BASE_COLOR);
      this.backWallMaterial.envMapIntensity = 0.03;
      this.backWallMaterial.emissiveIntensity = backWallBase + response * 0.006;
    }
    if (this.backPlateMaterial) {
      // Back plate stays a stable hero read; opacity is fixed (not driven by sim state).
      this.backPlateMaterial.opacity = BACK_PLATE_SOURCE_OPACITY;
    }
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.backPlate] The rift image behind the aperture.
   *   Void mode (Lenox) never adds this group to the scene — it only needs the
   *   geometry, for source anchors and rift descriptors. Loading a 3.4MB hero
   *   plate for a chamber nobody renders is pure cost, so it is skipped there.
   */
  async init({ backPlate = true } = {}) {
    const [normalTexture, colorTexture, roughnessTexture, backPlateTexture] =
      await Promise.all([
        loadTexture(NORMAL_MAP_URL),
        loadTexture(COLOR_MAP_URL, { colorSpace: THREE.SRGBColorSpace }),
        loadTexture(ROUGHNESS_MAP_URL),
        backPlate
          ? loadTexture(BACK_PLATE_URL, {
              repeat: false,
              colorSpace: THREE.SRGBColorSpace,
            })
          : null,
      ]);
    this.sourceTextures = [
      normalTexture,
      colorTexture,
      roughnessTexture,
      backPlateTexture,
    ].filter(Boolean);

    if (backPlateTexture) {
      backPlateTexture.center.set(0.5, 0.5);
      backPlateTexture.repeat.set(1, 1);
      backPlateTexture.offset.set(0, 0);
    }

    const {
      apertureWidth,
      apertureHeight,
      frameSide,
      frameTop: frameTopSize,
      frameDepth,
      linerDepth: revealDepth,
      depth,
      centerX,
      centerY,
      centerZ,
    } = PREENTER_VESSEL;

    const outerWidth = apertureWidth + frameSide * 2;
    const outerHeight = apertureHeight + frameTopSize * 2;
    const frameFrontZ = frameDepth * 0.5;
    const revealCenterZ = frameDepth + revealDepth * 0.5;
    const innerDepth = Math.max(0.12, depth - frameDepth - revealDepth);
    const interiorCenterZ = frameDepth + revealDepth + innerDepth * 0.5;
    const backWallZ = depth;

    const frameMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x2d2a27,
      emissive: 0x080706,
      normalScale: 0.095,
      roughness: 0.955,
      metalness: 0.03,
      envMapIntensity: 0.1,
      repeatX: 1.2,
      repeatY: 1.1,
    });
    const linerMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x1b1c1f,
      emissive: 0x050608,
      normalScale: 0.02,
      roughness: 0.99,
      metalness: 0.025,
      envMapIntensity: 0.025,
      repeatX: 0.8,
      repeatY: 0.9,
      side: THREE.DoubleSide,
    });
    const leftWallMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x232425,
      emissive: 0x050607,
      normalScale: 0.082,
      roughness: 0.969,
      metalness: 0.03,
      envMapIntensity: 0.075,
      repeatX: 1.16,
      repeatY: 1.14,
      side: THREE.DoubleSide,
    });
    const rightWallMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x232425,
      emissive: 0x050607,
      normalScale: 0.082,
      roughness: 0.969,
      metalness: 0.03,
      envMapIntensity: 0.075,
      repeatX: 1.16,
      repeatY: 1.14,
      side: THREE.DoubleSide,
    });
    const topWallMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x1f2227,
      emissive: 0x040609,
      normalScale: 0.072,
      roughness: 0.976,
      metalness: 0.028,
      envMapIntensity: 0.072,
      repeatX: 1.18,
      repeatY: 1.12,
      side: THREE.DoubleSide,
    });
    const bottomWallMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x26211d,
      emissive: 0x080503,
      normalScale: 0.072,
      roughness: 0.97,
      metalness: 0.028,
      envMapIntensity: 0.082,
      repeatX: 1.18,
      repeatY: 1.12,
      side: THREE.DoubleSide,
    });
    const backWallMaterial = createStoneMaterial({
      mapTexture: colorTexture,
      normalTexture,
      roughnessTexture,
      color: 0x101114,
      emissive: 0x030405,
      normalScale: 0.05,
      roughness: 0.99,
      metalness: 0.02,
      envMapIntensity: 0.03,
      repeatX: 1,
      repeatY: 1,
      side: THREE.DoubleSide,
    });
    const backPlateMaterial = backPlateTexture
      ? new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xffffff),
          map: backPlateTexture,
          side: THREE.DoubleSide,
          toneMapped: false,
          transparent: true,
          opacity: BACK_PLATE_SOURCE_OPACITY,
          depthWrite: false,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      : null;
    setTextureOffset(leftWallMaterial, 0.14, 0.06);
    setTextureOffset(rightWallMaterial, 0.14, 0.06);
    setTextureOffset(topWallMaterial, 0.22, 0.28);
    setTextureOffset(bottomWallMaterial, 0.1, 0.33);
    setTextureOffset(linerMaterial, 0.18, 0.14);
    this.frameMaterial = frameMaterial;
    this.linerMaterial = linerMaterial;
    this.backWallMaterial = backWallMaterial;
    this.interiorWallMaterials = [
      leftWallMaterial,
      rightWallMaterial,
      topWallMaterial,
      bottomWallMaterial,
    ];

    const group = new THREE.Group();

    const frameLeft = configureStaticMesh(
      new THREE.Mesh(
        new THREE.BoxGeometry(frameSide, outerHeight, frameDepth),
        frameMaterial,
      ),
    );
    frameLeft.position.set(-outerWidth * 0.5 + frameSide * 0.5, 0, frameFrontZ);

    const frameRight = configureStaticMesh(
      new THREE.Mesh(
        new THREE.BoxGeometry(frameSide, outerHeight, frameDepth),
        frameMaterial,
      ),
    );
    frameRight.position.set(outerWidth * 0.5 - frameSide * 0.5, 0, frameFrontZ);

    const frameTop = configureStaticMesh(
      new THREE.Mesh(
        new THREE.BoxGeometry(apertureWidth, frameTopSize, frameDepth),
        frameMaterial,
      ),
    );
    frameTop.position.set(
      0,
      outerHeight * 0.5 - frameTopSize * 0.5,
      frameFrontZ,
    );

    const frameBottom = configureStaticMesh(
      new THREE.Mesh(
        new THREE.BoxGeometry(apertureWidth, frameTopSize, frameDepth),
        frameMaterial,
      ),
    );
    frameBottom.position.set(
      0,
      -outerHeight * 0.5 + frameTopSize * 0.5,
      frameFrontZ,
    );

    const linerLeft = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(revealDepth, apertureHeight),
        linerMaterial,
      ),
    );
    linerLeft.position.set(-apertureWidth * 0.5, 0, revealCenterZ);
    linerLeft.rotation.y = Math.PI * 0.5;

    const linerRight = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(revealDepth, apertureHeight),
        linerMaterial,
      ),
    );
    linerRight.position.set(apertureWidth * 0.5, 0, revealCenterZ);
    linerRight.rotation.y = -Math.PI * 0.5;

    const linerTop = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, revealDepth),
        linerMaterial,
      ),
    );
    linerTop.position.set(0, apertureHeight * 0.5, revealCenterZ);
    linerTop.rotation.x = -Math.PI * 0.5;

    const linerBottom = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, revealDepth),
        linerMaterial,
      ),
    );
    linerBottom.position.set(0, -apertureHeight * 0.5, revealCenterZ);
    linerBottom.rotation.x = Math.PI * 0.5;

    const leftWall = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(innerDepth, apertureHeight),
        leftWallMaterial,
      ),
    );
    leftWall.position.set(-apertureWidth * 0.5, 0, interiorCenterZ);
    leftWall.rotation.y = Math.PI * 0.5;

    const rightWall = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(innerDepth, apertureHeight),
        rightWallMaterial,
      ),
    );
    rightWall.position.set(apertureWidth * 0.5, 0, interiorCenterZ);
    rightWall.rotation.y = -Math.PI * 0.5;

    const topWall = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, innerDepth),
        topWallMaterial,
      ),
    );
    topWall.position.set(0, apertureHeight * 0.5, interiorCenterZ);
    topWall.rotation.x = -Math.PI * 0.5;

    const bottomWall = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, innerDepth),
        bottomWallMaterial,
      ),
    );
    bottomWall.position.set(0, -apertureHeight * 0.5, interiorCenterZ);
    bottomWall.rotation.x = Math.PI * 0.5;

    const backWall = configureStaticMesh(
      new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, apertureHeight),
        backWallMaterial,
      ),
    );
    backWall.position.set(0, 0, backWallZ);
    this.backWall = backWall;

    group.add(frameLeft, frameRight, frameTop, frameBottom);
    group.add(linerLeft, linerRight, linerTop, linerBottom);
    group.add(leftWall, rightWall, topWall, bottomWall);
    group.add(backWall);

    if (backPlateMaterial) {
      const backPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, apertureHeight),
        backPlateMaterial,
      );
      backPlate.position.set(0, 0, depth - 0.006);
      this.backPlate = backPlate;
      this.backPlateMaterial = backPlateMaterial;
      group.add(backPlate);
    }

    group.position.set(centerX, centerY, centerZ);
    this.object = group;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set(this.sourceTextures);

    this.object?.traverse?.((child) => {
      if (child.geometry) {
        geometries.add(child.geometry);
      }
      const childMaterials = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : [];
      childMaterials.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) {
            textures.add(value);
          }
        });
      });
    });

    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    textures.forEach((texture) => texture.dispose?.());

    this.object?.parent?.remove?.(this.object);

    this.object = null;
    this.frameMaterial = null;
    this.linerMaterial = null;
    this.backWallMaterial = null;
    this.backWall = null;
    this.backPlateMaterial = null;
    this.backPlate = null;
    this.interiorWallMaterials = [];
    this.sourceTextures = [];
  }
}

export default BackgroundGeometry;
