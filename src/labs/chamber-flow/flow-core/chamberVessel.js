import * as THREE from "three/webgpu";

const NORMAL_MAP_URL = "/flow-assets/concrete_0016_normal_opengl_1k.png";
const COLOR_MAP_URL = "/flow-assets/concrete_0016_color_1k.jpg";
const ROUGHNESS_MAP_URL = "/flow-assets/concrete_0016_roughness_1k.jpg";
const BACK_PLATE_URL = "/images/volkano-bg.png";

const textureLoader = new THREE.TextureLoader();

export const VESSEL = Object.freeze({
    aspect: 16 / 9,
    apertureWidth: 1.84,
    apertureHeight: 1.84 / (16 / 9),
    frameSide: 0.18,
    frameTop: 0.11,
    frameDepth: 0.11,
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
        textureLoader.load(file, tex => {
            tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            if (colorSpace) tex.colorSpace = colorSpace;
            resolve(tex);
        });
    });

const cloneTexture = (src, rx = 1, ry = 1) => {
    const t = src.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
};

const stoneMaterial = ({ map, normal, roughness, color, emissive, normalScale = 0.22, rough = 0.94, metal = 0.04, envMap = 0.18, rx = 1.4, ry = 1.4, side = THREE.FrontSide }) =>
    new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(emissive),
        emissiveIntensity: 0.018,
        map: cloneTexture(map, rx, ry),
        normalMap: cloneTexture(normal, rx, ry),
        roughnessMap: cloneTexture(roughness, rx, ry),
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughness: rough,
        metalness: metal,
        envMapIntensity: envMap,
        side,
    });

const setOffset = (mat, ox, oy) => {
    if (mat.map) mat.map.offset.set(ox, oy);
    if (mat.normalMap) mat.normalMap.offset.set(ox, oy);
    if (mat.roughnessMap) mat.roughnessMap.offset.set(ox, oy);
};

const staticMesh = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
};

class ChamberVessel {
    object = null;

    async init() {
        const [normalTex, colorTex, roughTex, backPlateTex] = await Promise.all([
            loadTexture(NORMAL_MAP_URL),
            loadTexture(COLOR_MAP_URL, { colorSpace: THREE.SRGBColorSpace }),
            loadTexture(ROUGHNESS_MAP_URL),
            loadTexture(BACK_PLATE_URL, { repeat: false, colorSpace: THREE.SRGBColorSpace }),
        ]);

        const tex = { map: colorTex, normal: normalTex, roughness: roughTex };

        const {
            apertureWidth: aw,
            apertureHeight: ah,
            frameSide: fs,
            frameTop: ft,
            frameDepth: fd,
            linerDepth: ld,
            depth,
            centerX, centerY, centerZ,
        } = VESSEL;

        const ow = aw + fs * 2;
        const oh = ah + ft * 2;
        const frameFrontZ = fd * 0.5;
        const linerCenterZ = fd + ld * 0.5;
        const innerDepth = Math.max(0.12, depth - fd - ld);
        const innerCenterZ = fd + ld + innerDepth * 0.5;

        // --- Frame (aperture border) ---
        const frameMat = stoneMaterial({ ...tex, color: 0x2d2a27, emissive: 0x080706, normalScale: 0.095, rough: 0.955, metal: 0.03, envMap: 0.1, rx: 1.2, ry: 1.1 });

        const frameL = staticMesh(new THREE.BoxGeometry(fs, oh, fd), frameMat);
        frameL.position.set(-ow * 0.5 + fs * 0.5, 0, frameFrontZ);

        const frameR = staticMesh(new THREE.BoxGeometry(fs, oh, fd), frameMat);
        frameR.position.set(ow * 0.5 - fs * 0.5, 0, frameFrontZ);

        const frameT = staticMesh(new THREE.BoxGeometry(aw, ft, fd), frameMat);
        frameT.position.set(0, oh * 0.5 - ft * 0.5, frameFrontZ);

        const frameB = staticMesh(new THREE.BoxGeometry(aw, ft, fd), frameMat);
        frameB.position.set(0, -oh * 0.5 + ft * 0.5, frameFrontZ);

        // --- Liner (depth reveal) ---
        const linerMat = stoneMaterial({ ...tex, color: 0x1b1c1f, emissive: 0x050608, normalScale: 0.02, rough: 0.99, metal: 0.025, envMap: 0.025, rx: 0.8, ry: 0.9, side: THREE.DoubleSide });
        setOffset(linerMat, 0.18, 0.14);

        const linerL = staticMesh(new THREE.PlaneGeometry(ld, ah), linerMat);
        linerL.position.set(-aw * 0.5, 0, linerCenterZ);
        linerL.rotation.y = Math.PI * 0.5;

        const linerR = staticMesh(new THREE.PlaneGeometry(ld, ah), linerMat);
        linerR.position.set(aw * 0.5, 0, linerCenterZ);
        linerR.rotation.y = -Math.PI * 0.5;

        const linerT = staticMesh(new THREE.PlaneGeometry(aw, ld), linerMat);
        linerT.position.set(0, ah * 0.5, linerCenterZ);
        linerT.rotation.x = -Math.PI * 0.5;

        const linerBt = staticMesh(new THREE.PlaneGeometry(aw, ld), linerMat);
        linerBt.position.set(0, -ah * 0.5, linerCenterZ);
        linerBt.rotation.x = Math.PI * 0.5;

        // --- Interior walls ---
        const wallL = stoneMaterial({ ...tex, color: 0x242220, emissive: 0x050403, normalScale: 0.082, rough: 0.968, metal: 0.03, envMap: 0.072, rx: 1.16, ry: 1.14, side: THREE.DoubleSide });
        setOffset(wallL, 0.14, 0.06);
        const leftWall = staticMesh(new THREE.PlaneGeometry(innerDepth, ah), wallL);
        leftWall.position.set(-aw * 0.5, 0, innerCenterZ);
        leftWall.rotation.y = Math.PI * 0.5;

        const wallR = stoneMaterial({ ...tex, color: 0x22252a, emissive: 0x05070a, normalScale: 0.082, rough: 0.97, metal: 0.03, envMap: 0.078, rx: 1.16, ry: 1.14, side: THREE.DoubleSide });
        setOffset(wallR, 0.37, 0.11);
        const rightWall = staticMesh(new THREE.PlaneGeometry(innerDepth, ah), wallR);
        rightWall.position.set(aw * 0.5, 0, innerCenterZ);
        rightWall.rotation.y = -Math.PI * 0.5;

        const wallTop = stoneMaterial({ ...tex, color: 0x1f2227, emissive: 0x040609, normalScale: 0.072, rough: 0.976, metal: 0.028, envMap: 0.072, rx: 1.18, ry: 1.12, side: THREE.DoubleSide });
        setOffset(wallTop, 0.22, 0.28);
        const topWall = staticMesh(new THREE.PlaneGeometry(aw, innerDepth), wallTop);
        topWall.position.set(0, ah * 0.5, innerCenterZ);
        topWall.rotation.x = -Math.PI * 0.5;

        const wallBtm = stoneMaterial({ ...tex, color: 0x26211d, emissive: 0x080503, normalScale: 0.072, rough: 0.97, metal: 0.028, envMap: 0.082, rx: 1.18, ry: 1.12, side: THREE.DoubleSide });
        setOffset(wallBtm, 0.1, 0.33);
        const bottomWall = staticMesh(new THREE.PlaneGeometry(aw, innerDepth), wallBtm);
        bottomWall.position.set(0, -ah * 0.5, innerCenterZ);
        bottomWall.rotation.x = Math.PI * 0.5;

        // --- Back wall ---
        const backWallMat = stoneMaterial({ ...tex, color: 0x101114, emissive: 0x030405, normalScale: 0.05, rough: 0.99, metal: 0.02, envMap: 0.03, rx: 1, ry: 1, side: THREE.DoubleSide });
        const backWall = staticMesh(new THREE.PlaneGeometry(aw, ah), backWallMat);
        backWall.position.set(0, 0, depth);

        // --- Back plate (volcano image) ---
        const backPlate = new THREE.Mesh(
            new THREE.PlaneGeometry(aw, ah),
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(0xffffff),
                map: backPlateTex,
                side: THREE.DoubleSide,
                toneMapped: false,
            }),
        );
        backPlate.position.set(0, 0, depth - 0.002);
        backPlate.renderOrder = 4;

        // --- Assemble ---
        const group = new THREE.Group();
        group.add(
            frameL, frameR, frameT, frameB,
            linerL, linerR, linerT, linerBt,
            leftWall, rightWall, topWall, bottomWall,
            backWall, backPlate,
        );
        group.position.set(centerX, centerY, centerZ);
        this.object = group;
    }
}

export default ChamberVessel;
