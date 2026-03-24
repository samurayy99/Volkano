import * as THREE from "three/webgpu";
import { conf } from "./conf";
import { PREENTER_VESSEL } from "./backgroundGeometry";

const INSTANCE_COUNT = 12;
const FLOOR_Y = -PREENTER_VESSEL.apertureHeight * 0.5;

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

class AuthoredTakeoverLayer {
    object = null;
    mesh = null;
    instances = [];
    dummy = new THREE.Object3D();
    tmpCenter = new THREE.Vector3();
    tmpVector = new THREE.Vector3();

    constructor() {
        const geometry = new THREE.CapsuleGeometry(0.03, 0.36, 5, 10);
        geometry.rotateZ(Math.PI * 0.5);

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xa18b70),
            emissive: new THREE.Color(0x8a4720),
            emissiveIntensity: 0.24,
            roughness: 0.48,
            metalness: 0.08,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, INSTANCE_COUNT);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.visible = false;
        this.mesh.renderOrder = 6;

        this.object = new THREE.Group();
        this.object.add(this.mesh);

        this.instances = Array.from({ length: INSTANCE_COUNT }, (_, index) => {
            const normalized = index / Math.max(INSTANCE_COUNT - 1, 1);
            const centered = normalized - 0.5;
            return {
                normalized,
                startOffset: new THREE.Vector3(
                    centered * 0.16,
                    0.06 + Math.sin(normalized * Math.PI) * 0.04,
                    0.06 - Math.abs(centered) * 0.05,
                ),
                targetOffset: new THREE.Vector3(
                    centered * 0.7,
                    0.0,
                    0.22 + Math.cos(normalized * Math.PI) * 0.02,
                ),
                progressOffset: normalized * 0.065,
                rotationJitter: centered * 0.22,
                scaleJitter: 0.9 + Math.cos(normalized * Math.PI * 2) * 0.15,
            };
        });

        for (let i = 0; i < INSTANCE_COUNT; i += 1) {
            this.dummy.position.set(0, -100, 0);
            this.dummy.scale.setScalar(0.001);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    getFrontCenter(target = new THREE.Vector3()) {
        target.set(
            0,
            FLOOR_Y + 0.1,
            PREENTER_VESSEL.frameDepth + PREENTER_VESSEL.linerDepth * 0.62,
        );
        return target;
    }

    update() {
        const mix = conf.authoredTakeoverMix || 0;
        const material = this.mesh.material;
        const visible = mix > 0.001;

        this.mesh.visible = visible;
        const vanishPhase = easeOutCubic(THREE.MathUtils.clamp((mix - 0.52) / 0.48, 0, 1));
        material.opacity = THREE.MathUtils.clamp(0.22 + mix * 0.88, 0, 0.94);
        material.emissiveIntensity = THREE.MathUtils.lerp(0.24, 0.72, mix);

        if (!visible) {
            return;
        }

        const center = this.getFrontCenter(this.tmpCenter);
        const emerge = easeOutCubic(THREE.MathUtils.clamp(mix / 0.28, 0, 1));
        const settle = easeOutCubic(THREE.MathUtils.clamp((mix - 0.08) / 0.54, 0, 1));

        for (let i = 0; i < this.instances.length; i += 1) {
            const instance = this.instances[i];
            const localMix = easeOutCubic(
                THREE.MathUtils.clamp((mix - instance.progressOffset) / (1 - instance.progressOffset * 0.6), 0, 1),
            );
            const startWeight = 1 - emerge;
            const rise = THREE.MathUtils.lerp(0.18, 0.0, settle);
            const startPosition = this.tmpVector.copy(center).add(instance.startOffset);
            const targetPosition = center.clone().add(instance.targetOffset);
            targetPosition.y = FLOOR_Y + 0.34 + Math.sin(instance.normalized * Math.PI) * 0.035;

            const position = startPosition.multiplyScalar(startWeight).add(targetPosition.multiplyScalar(emerge));
            position.y += rise;

            const yaw = THREE.MathUtils.lerp(
                -0.28 + instance.rotationJitter * 0.9,
                0.0 + instance.rotationJitter * 0.08,
                settle,
            );
            const pitch = THREE.MathUtils.lerp(-0.08, 0.02, settle);
            const roll = THREE.MathUtils.lerp(0.18 * Math.sign(instance.normalized - 0.5 || 1), 0, settle);
            const scaleX = THREE.MathUtils.lerp(0.95, 1.55 + instance.scaleJitter * 0.35, localMix);
            const scaleY = THREE.MathUtils.lerp(0.78, 1.02 + instance.scaleJitter * 0.08, localMix);
            const scaleZ = THREE.MathUtils.lerp(0.86, 1.16 + instance.scaleJitter * 0.1, localMix);

            this.dummy.position.copy(position);
            this.dummy.rotation.set(pitch, yaw, roll);
            this.dummy.scale.set(scaleX, scaleY, scaleZ);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.mesh?.geometry?.dispose?.();
        this.mesh?.material?.dispose?.();
    }
}

export default AuthoredTakeoverLayer;
