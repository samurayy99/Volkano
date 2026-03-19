import * as THREE from "three/webgpu";
import { conf } from "./conf";

const NORMAL_MAP_URL = "/flow-assets/concrete_0016_normal_opengl_1k.png";
const COLOR_MAP_URL = "/flow-assets/concrete_0016_color_1k.jpg";
const ROUGHNESS_MAP_URL = "/flow-assets/concrete_0016_roughness_1k.jpg";
const BACK_PLATE_URL = "/images/rift-monolith.png";

const textureLoader = new THREE.TextureLoader();

export const PREENTER_VESSEL = Object.freeze({
    aspect: 16 / 9,
    apertureWidth: 1.84,
    apertureHeight: 1.84 / (16 / 9),
    frameSide: 0.18,
    frameTop: 0.11,
    frameDepth: 0.11,
    linerThickness: 0.066,
    linerDepth: 0.22,
    depth: 1.18,
    centerX: 0,
    centerY: 0.43,
    centerZ: 0.02,
    lookAtX: 0,
    lookAtY: 0.44,
    lookAtZ: 0.46,
});

const loadTexture = (file, { repeat = true, colorSpace = null } = {}) =>
    new Promise(resolve => {
        textureLoader.load(file, loadedTexture => {
            loadedTexture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            loadedTexture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            if (colorSpace) {
                loadedTexture.colorSpace = colorSpace;
            }
            resolve(loadedTexture);
        });
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
}) => new THREE.MeshStandardMaterial({
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

const configureStaticMesh = mesh => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
};

class BackgroundGeometry {
    object = null;
    response = 0;
    debugView = "composite";
    frameMaterial = null;
    linerMaterial = null;
    backWallMaterial = null;
    backPlateMaterial = null;
    backPlate = null;
    sourceDebugRing = null;
    sourceDebugArrow = null;

    addImpulse(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return;
        this.response = Math.min(1, this.response + amount);
    }

    setDebugView(view = "composite") {
        this.debugView = view;
    }

    getCraterAnchorLocal() {
        const u = conf.craterUV?.x ?? 0.488;
        const v = conf.craterUV?.y ?? 0.714;
        return new THREE.Vector3(
            (u - 0.5) * PREENTER_VESSEL.apertureWidth,
            (v - 0.5) * PREENTER_VESSEL.apertureHeight,
            this.backPlate?.position.z ?? (PREENTER_VESSEL.depth - 0.002),
        );
    }

    getCraterSourceDescriptor() {
        if (!this.object) {
            return null;
        }

        this.object.updateWorldMatrix(true, false);

        const craterAnchorLocal = this.getCraterAnchorLocal();
        const ventOriginLocal = craterAnchorLocal.clone().add(new THREE.Vector3(0, 0, -(conf.ventDepthOffset ?? 0.042)));
        const transitionDepthOffset = Math.max(
            (conf.ventDepthOffset ?? 0.042) * 3.5,
            PREENTER_VESSEL.depth * 0.18,
        );
        const transitionOriginLocal = craterAnchorLocal.clone().add(new THREE.Vector3(0, 0, -transitionDepthOffset));
        const ventAxisLocal = (conf.ventAxisLocal ?? new THREE.Vector3(0.012, 0.978, -0.208)).clone().normalize();

        return {
            craterAnchorLocal,
            ventOriginLocal,
            transitionOriginLocal,
            ventAxisLocal,
            craterAnchorWorld: this.object.localToWorld(craterAnchorLocal.clone()),
            ventOriginWorld: this.object.localToWorld(ventOriginLocal.clone()),
            transitionOriginWorld: this.object.localToWorld(transitionOriginLocal.clone()),
            ventAxisWorld: ventAxisLocal.clone().transformDirection(this.object.matrixWorld).normalize(),
            rightWorld: new THREE.Vector3(1, 0, 0).transformDirection(this.object.matrixWorld).normalize(),
            upWorld: new THREE.Vector3(0, 1, 0).transformDirection(this.object.matrixWorld).normalize(),
        };
    }

    syncSourceDebug() {
        const debugVisible = conf.particleDebugMode === "source" && this.debugView !== "particles";
        if (!this.sourceDebugRing || !this.sourceDebugArrow) {
            return;
        }

        this.sourceDebugRing.visible = debugVisible;
        this.sourceDebugArrow.visible = debugVisible;

        if (!debugVisible) {
            return;
        }

        const descriptor = this.getCraterSourceDescriptor();
        if (!descriptor) {
            return;
        }

        this.sourceDebugRing.position.copy(descriptor.craterAnchorLocal).add(new THREE.Vector3(0, 0, -0.0025));
        this.sourceDebugArrow.position.copy(descriptor.ventOriginLocal);
        this.sourceDebugArrow.setDirection(descriptor.ventAxisLocal);
        this.sourceDebugArrow.setLength(Math.max(0.08, (conf.ventDepthOffset ?? 0.042) * 2.6), 0.028, 0.014);
    }

    update(delta) {
        const dt = Math.max(0, Math.min(0.1, delta || 0));
        this.response *= Math.exp(-dt / 0.09);
        if (this.response < 0.002) this.response = 0;

        const response = this.debugView === "geometry" ? 0 : this.response;
        const frameBase = this.debugView === "geometry" ? 0.014 : 0.018;
        const linerBase = this.debugView === "geometry" ? 0.004 : 0.006;
        const backWallBase = this.debugView === "geometry" ? 0.003 : 0.004;

        if (this.frameMaterial) {
            this.frameMaterial.emissiveIntensity = frameBase + response * 0.035;
        }

        if (this.linerMaterial) {
            this.linerMaterial.emissiveIntensity = linerBase + response * 0.012;
        }

        if (this.backWallMaterial) {
            this.backWallMaterial.emissiveIntensity = backWallBase + response * 0.008;
        }

        if (this.backPlateMaterial) {
            this.backPlateMaterial.opacity = this.debugView === "geometry" ? 0.92 : 0.98;
        }

        this.syncSourceDebug();
    }

    async init() {
        const [
            normalTexture,
            colorTexture,
            roughnessTexture,
            backPlateTexture,
        ] = await Promise.all([
            loadTexture(NORMAL_MAP_URL),
            loadTexture(COLOR_MAP_URL, { colorSpace: THREE.SRGBColorSpace }),
            loadTexture(ROUGHNESS_MAP_URL),
            loadTexture(BACK_PLATE_URL, {
                repeat: false,
                colorSpace: THREE.SRGBColorSpace,
            }),
        ]);

        backPlateTexture.center.set(0.5, 0.5);
        backPlateTexture.repeat.set(1, 1);
        backPlateTexture.offset.set(0, 0);

        const {
            apertureWidth,
            apertureHeight,
            frameSide,
            frameTop: frameTopSize,
            frameDepth,
            linerThickness,
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
            color: 0x242220,
            emissive: 0x050403,
            normalScale: 0.082,
            roughness: 0.968,
            metalness: 0.03,
            envMapIntensity: 0.072,
            repeatX: 1.16,
            repeatY: 1.14,
            side: THREE.DoubleSide,
        });
        const rightWallMaterial = createStoneMaterial({
            mapTexture: colorTexture,
            normalTexture,
            roughnessTexture,
            color: 0x22252a,
            emissive: 0x05070a,
            normalScale: 0.082,
            roughness: 0.97,
            metalness: 0.03,
            envMapIntensity: 0.078,
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
        setTextureOffset(leftWallMaterial, 0.14, 0.06);
        setTextureOffset(rightWallMaterial, 0.37, 0.11);
        setTextureOffset(topWallMaterial, 0.22, 0.28);
        setTextureOffset(bottomWallMaterial, 0.1, 0.33);
        setTextureOffset(linerMaterial, 0.18, 0.14);
        this.frameMaterial = frameMaterial;
        this.linerMaterial = linerMaterial;
        this.backWallMaterial = backWallMaterial;

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
        frameTop.position.set(0, outerHeight * 0.5 - frameTopSize * 0.5, frameFrontZ);

        const frameBottom = configureStaticMesh(
            new THREE.Mesh(
                new THREE.BoxGeometry(apertureWidth, frameTopSize, frameDepth),
                frameMaterial,
            ),
        );
        frameBottom.position.set(0, -outerHeight * 0.5 + frameTopSize * 0.5, frameFrontZ);

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

        const backPlate = new THREE.Mesh(
            new THREE.PlaneGeometry(apertureWidth, apertureHeight),
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(0xffffff),
                map: backPlateTexture,
                side: THREE.DoubleSide,
                toneMapped: false,
            }),
        );
        backPlate.position.set(0, 0, depth - 0.002);
        backPlate.renderOrder = 4;
        this.backPlate = backPlate;
        this.backPlateMaterial = backPlate.material;

        const sourceDebugRing = new THREE.Mesh(
            new THREE.RingGeometry(0.018, 0.03, 32),
            new THREE.MeshBasicMaterial({
                color: 0xffb05c,
                transparent: true,
                opacity: 0.9,
                toneMapped: false,
                side: THREE.DoubleSide,
            }),
        );
        sourceDebugRing.visible = false;
        this.sourceDebugRing = sourceDebugRing;

        const sourceDebugArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(),
            0.12,
            0xffb05c,
            0.028,
            0.014,
        );
        sourceDebugArrow.visible = false;
        this.sourceDebugArrow = sourceDebugArrow;

        group.add(frameLeft, frameRight, frameTop, frameBottom);
        group.add(linerLeft, linerRight, linerTop, linerBottom);
        group.add(leftWall, rightWall, topWall, bottomWall);
        group.add(backWall, backPlate);
        group.add(sourceDebugRing, sourceDebugArrow);

        group.position.set(centerX, centerY, centerZ);
        this.object = group;
        this.syncSourceDebug();
    }
}

export default BackgroundGeometry;
