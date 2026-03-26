import * as THREE from "three/webgpu";
import {
    array,
    Fn,
    If,
    instancedArray,
    instanceIndex,
    Return,
    uniform,
    int,
    float,
    Loop,
    vec3,
    vec4,
    atomicAdd,
    uint,
    max,
    pow,
    mat3,
    clamp,
    time,
    cross, mix, ivec3, smoothstep
} from "three/tsl";
import {triNoise3Dvec} from "../common/noise";
import {conf} from "../conf";
import {StructuredArray} from "./structuredArray.js";

class mlsMpmSimulator {
    renderer = null;
    numParticles = 0;
    gridSize = new THREE.Vector3(0,0,0);
    gridCellSize = new THREE.Vector3(0,0,0);
    uniforms = {};
    kernels = {};
    fixedPointMultiplier = 1e7;
    mousePos = new THREE.Vector3();
    mousePosArray = [];

    constructor(renderer) {
        this.renderer = renderer;
    }
    async init() {
        const {maxParticles} = conf;
        this.gridSize.set(64,64,64);

        const particleStruct =  {
            position: { type: 'vec3' },
            density: { type: 'float' },
            velocity: { type: 'vec3' },
            mass: { type: 'float' },
            C: { type: 'mat3' },
            direction: { type: 'vec3' },
            color: { type: 'vec3' },
            heat: { type: 'float' },
        };
        this.particleBuffer = new StructuredArray(particleStruct, maxParticles, "particleData");

        const vec = new THREE.Vector3();
        for (let i = 0; i < maxParticles; i++) {
            let dist = 2;
            while (dist > 1) {
                vec.set(Math.random(),Math.random(),Math.random()).multiplyScalar(2.0).subScalar(1.0);
                dist = vec.length();
                vec.multiplyScalar(0.95).addScalar(1.0).divideScalar(2.0).multiply(this.gridSize);
            }
            const mass = 1.0 - Math.random() * 0.002;
            this.particleBuffer.set(i, "position", vec);
            this.particleBuffer.set(i, "mass", mass);
            this.particleBuffer.set(i, "heat", 0);
        }

        const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
        const cellStruct ={
            x: { type: 'int', atomic: true },
            y: { type: 'int', atomic: true },
            z: { type: 'int', atomic: true },
            mass: { type: 'int', atomic: true },
        };
        this.cellBuffer = new StructuredArray(cellStruct, cellCount, "cellData");
        this.cellBufferF = instancedArray(cellCount, 'vec4').label('cellDataF');

        this.uniforms.gravityType = uniform(0, "uint");
        this.uniforms.gravity = uniform(new THREE.Vector3());
        this.uniforms.stiffness = uniform(0);
        this.uniforms.restDensity = uniform(0);
        this.uniforms.dynamicViscosity = uniform(0);
        this.uniforms.noise = uniform(0);

        this.uniforms.gridSize = uniform(this.gridSize, "ivec3");
        this.uniforms.gridCellSize = uniform(this.gridCellSize);
        this.uniforms.dt = uniform(0.1);
        this.uniforms.numParticles = uniform(0, "uint");

        this.uniforms.mouseRayDirection = uniform(new THREE.Vector3());
        this.uniforms.mouseRayOrigin = uniform(new THREE.Vector3());
        this.uniforms.mouseForce = uniform(new THREE.Vector3());
        this.uniforms.sourceFieldCenter = uniform(new THREE.Vector3());
        this.uniforms.sourceFieldSecondaryCenter = uniform(new THREE.Vector3());
        this.uniforms.sourceFieldRadius = uniform(1);
        this.uniforms.sourceFieldSecondaryRadius = uniform(1);
        this.uniforms.convergenceSlowdown = uniform(0);
        this.uniforms.convergenceCompression = uniform(0);
        this.uniforms.convergenceFreeze = uniform(0);
        this.uniforms.convergenceHeatRetention = uniform(0);
        this.uniforms.convergenceThermalExtinction = uniform(0);
        this.uniforms.postFreezeSimLock = uniform(0);
        this.uniforms.mouseInfluence = uniform(1);
        this.uniforms.mouseActive = uniform(0);

        this.kernels.clearGrid = Fn(() => {
            this.cellBuffer.setAtomic("x", false);
            this.cellBuffer.setAtomic("y", false);
            this.cellBuffer.setAtomic("z", false);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
                Return();
            });

            this.cellBuffer.element(instanceIndex).get('x').assign(0);
            this.cellBuffer.element(instanceIndex).get('y').assign(0);
            this.cellBuffer.element(instanceIndex).get('z').assign(0);
            this.cellBuffer.element(instanceIndex).get('mass').assign(0);
            this.cellBufferF.element(instanceIndex).assign(0);
        })().compute(cellCount);

        const encodeFixedPoint = (f32) => {
            return int(f32.mul(this.fixedPointMultiplier));
        }
        const decodeFixedPoint = (i32) => {
            return float(i32).div(this.fixedPointMultiplier);
        }

        const getCellPtr = (ipos) => {
            const gridSize = this.uniforms.gridSize;
            const cellPtr = int(ipos.x).mul(gridSize.y).mul(gridSize.z).add(int(ipos.y).mul(gridSize.z)).add(int(ipos.z)).toConst();
            return cellPtr;
        };
        const getCell = (ipos) => {
            return this.cellBuffer.element(getCellPtr(ipos));
        };

        this.kernels.p2g1 = Fn(() => {
            this.cellBuffer.setAtomic("x", true);
            this.cellBuffer.setAtomic("y", true);
            this.cellBuffer.setAtomic("z", true);
            this.cellBuffer.setAtomic("mass", true);

            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            If(this.uniforms.postFreezeSimLock.greaterThan(float(0.5)), () => {
                Return();
            });
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst("particlePosition");
            const particleVelocity = this.particleBuffer.element(instanceIndex).get('velocity').xyz.toConst("particleVelocity");

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const C = this.particleBuffer.element(instanceIndex).get('C').toConst();
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const Q = C.mul(cellDist);

                        const massContrib = weight; // assuming particle mass = 1.0
                        const velContrib = massContrib.mul(particleVelocity.add(Q)).toConst("velContrib");
                        const cell = getCell(cellX);
                        atomicAdd(cell.get('x'), encodeFixedPoint(velContrib.x));
                        atomicAdd(cell.get('y'), encodeFixedPoint(velContrib.y));
                        atomicAdd(cell.get('z'), encodeFixedPoint(velContrib.z));
                        atomicAdd(cell.get('mass'), encodeFixedPoint(massContrib));
                    });
                });
            });
        })().compute(1);


        this.kernels.p2g2 = Fn(() => {
            this.cellBuffer.setAtomic("x", true);
            this.cellBuffer.setAtomic("y", true);
            this.cellBuffer.setAtomic("z", true);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            If(this.uniforms.postFreezeSimLock.greaterThan(float(0.5)), () => {
                Return();
            });
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst("particlePosition");

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const density = float(0).toVar("density");
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cell = getCell(cellX);
                        density.addAssign(decodeFixedPoint(cell.get('mass')).mul(weight));
                    });
                });
            });
            const densityStore = this.particleBuffer.element(instanceIndex).get('density');
            densityStore.assign(mix(densityStore, density, 0.05));

            const volume = float(1).div(density);
            const pressure = max(0.0, pow(density.div(this.uniforms.restDensity), 5.0).sub(1).mul(this.uniforms.stiffness)).toConst('pressure');
            const stress = mat3(pressure.negate(), 0, 0, 0, pressure.negate(), 0, 0, 0, pressure.negate()).toVar('stress');
            const dudv = this.particleBuffer.element(instanceIndex).get('C').toConst('C');

            const strain = dudv.add(dudv.transpose());
            stress.addAssign(strain.mul(this.uniforms.dynamicViscosity));
            const eq16Term0 = volume.mul(-4).mul(stress).mul(this.uniforms.dt);

            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const cell= getCell(cellX);

                        const momentum = eq16Term0.mul(weight).mul(cellDist).toConst("momentum");
                        atomicAdd(cell.get('x'), encodeFixedPoint(momentum.x));
                        atomicAdd(cell.get('y'), encodeFixedPoint(momentum.y));
                        atomicAdd(cell.get('z'), encodeFixedPoint(momentum.z));
                    });
                });
            });
        })().compute(1);


        this.kernels.updateGrid = Fn(() => {
            this.cellBuffer.setAtomic("x", false);
            this.cellBuffer.setAtomic("y", false);
            this.cellBuffer.setAtomic("z", false);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
                Return();
            });
            const cell = this.cellBuffer.element(instanceIndex).toConst("cell");

            const mass = decodeFixedPoint(cell.get('mass')).toConst();
            If(mass.lessThanEqual(0), () => { Return(); });

            const vx = decodeFixedPoint(cell.get('x')).div(mass).toVar();
            const vy = decodeFixedPoint(cell.get('y')).div(mass).toVar();
            const vz = decodeFixedPoint(cell.get('z')).div(mass).toVar();

            const x = int(instanceIndex).div(this.uniforms.gridSize.z).div(this.uniforms.gridSize.y);
            const y = int(instanceIndex).div(this.uniforms.gridSize.z).mod(this.uniforms.gridSize.y);
            const z = int(instanceIndex).mod(this.uniforms.gridSize.z);


            If(x.lessThan(int(2)).or(x.greaterThan(this.uniforms.gridSize.x.sub(int(2)))), () => {
                vx.assign(0);
            });
            If(y.lessThan(int(2)).or(y.greaterThan(this.uniforms.gridSize.y.sub(int(2)))), () => {
                vy.assign(0);
            });
            If(z.lessThan(int(2)).or(z.greaterThan(this.uniforms.gridSize.z.sub(int(2)))), () => {
                vz.assign(0);
            });

            this.cellBufferF.element(instanceIndex).assign(vec4(vx,vy,vz,mass));
        })().compute(cellCount);

        this.kernels.g2p = Fn(() => {
            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            const particleMass = this.particleBuffer.element(instanceIndex).get('mass').toConst("particleMass");
            const particleDensity = this.particleBuffer.element(instanceIndex).get('density').toConst("particleDensity");
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toVar("particlePosition");
            const particleVelocity = vec3(0).toVar();
            If(this.uniforms.postFreezeSimLock.greaterThan(float(0.5)), () => {
                // Post-freeze belongs to the renderer. Freeze solver state immediately.
                this.particleBuffer.element(instanceIndex).get('C').assign(mat3(0));
                this.particleBuffer.element(instanceIndex).get('velocity').assign(vec3(0));
                Return();
            });
            If(this.uniforms.gravityType.equal(uint(2)), () => {
                const pn = particlePosition.div(vec3(this.uniforms.gridSize.sub(1))).sub(0.5).normalize().toConst();
                particleVelocity.addAssign(pn.negate().mul(0.3).mul(this.uniforms.dt));
            }).Else(() => {
                particleVelocity.addAssign(this.uniforms.gravity.mul(this.uniforms.dt));
            });


            const noise = triNoise3Dvec(particlePosition.mul(0.015), time, 0.11).sub(0.285).normalize().mul(0.28).toVar();
            particleVelocity.subAssign(noise.mul(this.uniforms.noise).mul(this.uniforms.dt));

            const convergenceCenter = mix(this.uniforms.sourceFieldCenter, this.uniforms.sourceFieldSecondaryCenter, float(0.42)).toConst("convergenceCenter");
            const toConvergenceCenter = convergenceCenter.sub(particlePosition).toConst("toConvergenceCenter");
            const convergenceDistance = toConvergenceCenter.length().max(float(0.0001)).toConst("convergenceDistance");
            const convergencePull = smoothstep(float(2.5), float(18.0), convergenceDistance)
                .mul(this.uniforms.convergenceCompression)
                .mul(float(0.38))
                .toConst("convergencePull");
            particleVelocity.addAssign(toConvergenceCenter.div(convergenceDistance).mul(convergencePull).mul(this.uniforms.dt));

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");

            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const B = mat3(0).toVar("B");
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const cellPtr = getCellPtr(cellX);

                        const weightedVelocity = this.cellBufferF.element(cellPtr).xyz.mul(weight).toConst("weightedVelocity");
                        const term = mat3(
                            weightedVelocity.mul(cellDist.x),
                            weightedVelocity.mul(cellDist.y),
                            weightedVelocity.mul(cellDist.z)
                        );
                        B.addAssign(term);
                        particleVelocity.addAssign(weightedVelocity);
                    });
                });
            });

            const dist = cross(this.uniforms.mouseRayDirection, particlePosition.mul(vec3(1,1,1.0)).sub(this.uniforms.mouseRayOrigin)).length()
            const force = dist.mul(0.1).oneMinus().max(0.0).pow(2);
            //particleVelocity.assign(mix(particleVelocity, this.uniforms.mouseForce.mul(6), force));
            particleVelocity.addAssign(
                this.uniforms.mouseForce
                    .mul(this.uniforms.mouseInfluence)
                    .mul(this.uniforms.mouseActive)
                    .mul(force)
            );
            particleVelocity.mulAssign(particleMass); // to ensure difference between particles

            const slowdownDamping = float(1).sub(this.uniforms.convergenceSlowdown.mul(0.006)).max(float(0.994)).toConst("slowdownDamping");
            particleVelocity.mulAssign(slowdownDamping);
            const freezeDamping = float(1).sub(this.uniforms.convergenceFreeze.mul(0.06)).max(float(0.94)).toConst("freezeDamping");
            particleVelocity.mulAssign(freezeDamping);

            this.particleBuffer.element(instanceIndex).get('C').assign(B.mul(4));
            particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt));
            particlePosition.assign(clamp(particlePosition, vec3(2), this.uniforms.gridSize.sub(2)));

            const wallStiffness = 0.3;
            const xN = particlePosition.add(particleVelocity.mul(this.uniforms.dt).mul(3.0)).toConst("xN");
            const wallMin = vec3(3).toConst("wallMin");
            const wallMax = vec3(this.uniforms.gridSize).sub(3).toConst("wallMax");
            If(xN.x.lessThan(wallMin.x), () => { particleVelocity.x.addAssign(wallMin.x.sub(xN.x).mul(wallStiffness)); });
            If(xN.x.greaterThan(wallMax.x), () => { particleVelocity.x.addAssign(wallMax.x.sub(xN.x).mul(wallStiffness)); });
            If(xN.y.lessThan(wallMin.y), () => { particleVelocity.y.addAssign(wallMin.y.sub(xN.y).mul(wallStiffness)); });
            If(xN.y.greaterThan(wallMax.y), () => { particleVelocity.y.addAssign(wallMax.y.sub(xN.y).mul(wallStiffness)); });
            If(xN.z.lessThan(wallMin.z), () => { particleVelocity.z.addAssign(wallMin.z.sub(xN.z).mul(wallStiffness)); });
            If(xN.z.greaterThan(wallMax.z), () => { particleVelocity.z.addAssign(wallMax.z.sub(xN.z).mul(wallStiffness)); });

            this.particleBuffer.element(instanceIndex).get('position').assign(particlePosition)
            this.particleBuffer.element(instanceIndex).get('velocity').assign(particleVelocity)

            const direction = this.particleBuffer.element(instanceIndex).get('direction');
            direction.assign(mix(direction,particleVelocity, 0.1));
            const previousHeat = this.particleBuffer.element(instanceIndex).get('heat').toConst("previousHeat");

            // VOLKANO THERMAL RAMP — dark body plus separate ignition channels
            const coal      = vec3(0.005, 0.003, 0.003);
            const deepRed   = vec3(0.20, 0.010, 0.010);
            const ember     = vec3(0.36, 0.026, 0.014);
            const flareRed  = vec3(0.78, 0.050, 0.022);
            const fireGold  = vec3(0.98, 0.60, 0.055);
            const hotWhite  = vec3(1.0, 0.80, 0.12);

            // Inputs — keep the body dark, let fast/source-bound particles carry ignition
            const densityRatio = smoothstep(float(0.22), float(1.18), particleDensity.div(this.uniforms.restDensity));
            const velocityFactor = smoothstep(float(0.12), float(0.92), particleVelocity.length().mul(0.26));

            // Centered noise — enough to break up neighborhoods without tinting the whole cloud warm
            const signedNoise = triNoise3Dvec(particlePosition.mul(0.12), 0.3, time).x.sub(0.285);

            const primarySourceProximity = particlePosition.sub(this.uniforms.sourceFieldCenter)
                .length()
                .div(this.uniforms.sourceFieldRadius)
                .oneMinus()
                .clamp(0, 1)
                .pow(1.6);
            const secondarySourceProximity = particlePosition.sub(this.uniforms.sourceFieldSecondaryCenter)
                .length()
                .div(this.uniforms.sourceFieldSecondaryRadius)
                .oneMinus()
                .clamp(0, 1)
                .pow(1.45);
            const sourceHeat = max(primarySourceProximity, secondarySourceProximity);

            const laneSignal = triNoise3Dvec(particlePosition.mul(0.17).add(particleVelocity.mul(0.12)), 0.08, time).x;
            const emberLane = smoothstep(float(0.25), float(0.37), laneSignal);
            const ignitionLane = smoothstep(float(0.38), float(0.50), laneSignal);
            const neighborhoodWarmth = smoothstep(float(-0.02), float(0.10), signedNoise);

            // Body heat owns the coal/deep-red mass and only occasionally lifts into ember.
            const bodyHeat = densityRatio.mul(0.18)
                .add(sourceHeat.mul(0.16))
                .add(velocityFactor.mul(0.08))
                .add(signedNoise.mul(0.06))
                .sub(0.14)
                .clamp(0, 1);
            const crimsonLift = emberLane
                .mul(velocityFactor.mul(0.14).add(sourceHeat.mul(0.08)).add(neighborhoodWarmth.mul(0.06)));
            const bodyThermal = bodyHeat.add(crimsonLift).clamp(0, 1);

            // Ignition carries memory: particles heat up near the source or cursor and cool gradually as they travel away.
            const hoverIgnition = dist
                .mul(0.12)
                .oneMinus()
                .max(0.0)
                .pow(4)
                .mul(this.uniforms.mouseActive)
                .clamp(0, 1);
            const heatMemory = mix(float(0.955), float(0.994), this.uniforms.convergenceHeatRetention).toConst("heatMemory");
            const thermalExtinction = this.uniforms.convergenceThermalExtinction
                .clamp(0, 0.98)
                .toConst("thermalExtinction");
            const ignitionHeat = previousHeat.mul(heatMemory)
                .add(sourceHeat.mul(0.045))
                .add(velocityFactor.mul(0.028))
                .add(ignitionLane.mul(sourceHeat.mul(0.008).add(velocityFactor.mul(0.006))))
                .add(hoverIgnition.mul(0.14))
                .clamp(0, 1);
            const collapseCooling = this.uniforms.convergenceThermalExtinction
                .clamp(0, 0.985)
                .toConst("collapseCooling");
            const cooledIgnitionHeat = ignitionHeat
                .mul(float(1).sub(collapseCooling).max(float(0.03)))
                .toConst("cooledIgnitionHeat");
            const colorIgnition = cooledIgnitionHeat.add(
                emberLane.mul(
                    sourceHeat.mul(0.10)
                        .add(velocityFactor.mul(0.07))
                        .add(neighborhoodWarmth.mul(0.05))
                        .mul(float(1).sub(thermalExtinction.mul(0.82)))
                )
            ).clamp(0, 1);
            const collapseFlareTame = this.uniforms.convergenceThermalExtinction
                .clamp(0, 0.985)
                .toConst("collapseFlareTame");
            const collapseColorIgnition = colorIgnition
                .mul(float(1).sub(collapseFlareTame.mul(0.86)))
                .clamp(0, 1)
                .toConst("collapseColorIgnition");
            const collapsePeakHeat = cooledIgnitionHeat
                .mul(float(1).sub(collapseFlareTame.mul(0.985)))
                .toConst("collapsePeakHeat");

            const bodyT1 = smoothstep(float(0.0),  float(0.22), bodyThermal);
            const bodyT2 = smoothstep(float(0.24), float(0.54), bodyThermal);
            const redIgnition = smoothstep(
                mix(float(0.12), float(0.16), thermalExtinction),
                mix(float(0.38), float(0.32), thermalExtinction),
                collapseColorIgnition
            );
            const fireIgnition = smoothstep(
                mix(float(0.54), float(0.9), thermalExtinction),
                mix(float(0.80), float(0.985), thermalExtinction),
                collapseColorIgnition
            );
            const hotIgnition = smoothstep(
                mix(float(0.94), float(0.9992), thermalExtinction),
                mix(float(0.992), float(0.99985), thermalExtinction),
                collapsePeakHeat
            );

            const c1 = mix(coal, deepRed, bodyT1);
            const c2 = mix(c1, ember, bodyT2);
            const c3 = mix(c2, flareRed, redIgnition);
            const fireLayer = fireIgnition
                .mul(float(1).sub(thermalExtinction.mul(0.96)))
                .toConst("fireLayer");
            const hotLayer = hotIgnition
                .mul(float(1).sub(thermalExtinction.mul(0.995)))
                .toConst("hotLayer");
            const c4 = mix(c3, fireGold, fireLayer);
            const color = mix(c4, hotWhite, hotLayer);
            const collapseDarken = this.uniforms.convergenceThermalExtinction.mul(0.18).toConst("collapseDarken");
            const cooledColor = mix(color, coal, collapseDarken);
            this.particleBuffer.element(instanceIndex).get('color').assign(cooledColor);
            this.particleBuffer.element(instanceIndex).get('heat').assign(cooledIgnitionHeat);
        })().compute(1);
    }

    setMouseRay(origin, direction, pos) {
        origin.multiplyScalar(64);
        pos.multiplyScalar(64);
        origin.add(new THREE.Vector3(32,0,0));
        this.uniforms.mouseRayDirection.value.copy(direction.normalize());
        this.uniforms.mouseRayOrigin.value.copy(origin);
        this.mousePos.copy(pos);
    }

    async update(interval, elapsed) {
        const { particles, run, noise, dynamicViscosity, stiffness, restDensity, speed, gravity, gravitySensorReading, accelerometerReading } = conf;

        this.uniforms.noise.value = noise;
        this.uniforms.stiffness.value = stiffness;
        this.uniforms.gravityType.value = gravity;
        if (gravity === 0) {
            this.uniforms.gravity.value.set(0,0,0.2);
        } else if (gravity === 1) {
            this.uniforms.gravity.value.set(0,-0.2,0);
        } else if (gravity === 3) {
            this.uniforms.gravity.value.copy(gravitySensorReading).add(accelerometerReading);
        }
        this.uniforms.dynamicViscosity.value = dynamicViscosity;
        this.uniforms.restDensity.value = restDensity;
        this.uniforms.sourceFieldCenter.value.copy(conf.sourceFieldCenter);
        this.uniforms.sourceFieldSecondaryCenter.value.copy(conf.sourceFieldSecondaryCenter);
        this.uniforms.sourceFieldRadius.value = (conf.sourceFieldRadii.x + conf.sourceFieldRadii.y + conf.sourceFieldRadii.z) / 3 * 0.82;
        this.uniforms.sourceFieldSecondaryRadius.value = (conf.sourceFieldSecondaryRadii.x + conf.sourceFieldSecondaryRadii.y + conf.sourceFieldSecondaryRadii.z) / 3 * 0.88;
        this.uniforms.convergenceSlowdown.value = conf.convergenceSlowdown;
        this.uniforms.convergenceCompression.value = conf.convergenceCompression;
        this.uniforms.convergenceFreeze.value = conf.convergenceFreeze;
        this.uniforms.convergenceHeatRetention.value = conf.convergenceHeatRetention;
        this.uniforms.convergenceThermalExtinction.value = conf.convergenceThermalExtinction;
        this.uniforms.postFreezeSimLock.value = conf.postFreezeSimLock || 0;

        if (particles !== this.numParticles) {
            this.numParticles = particles;
            this.uniforms.numParticles.value = particles;
            this.kernels.p2g1.count = particles;
            this.kernels.p2g1.updateDispatchCount();
            this.kernels.p2g2.count = particles;
            this.kernels.p2g2.updateDispatchCount();
            this.kernels.g2p.count = particles;
            this.kernels.g2p.updateDispatchCount();
        }

        interval = Math.min(interval, 1/60);
        const dt = interval * 6 * speed;
        this.uniforms.dt.value = dt;

        this.mousePosArray.push(this.mousePos.clone())
        if (this.mousePosArray.length > 2) { this.mousePosArray.shift(); }
        if (this.mousePosArray.length > 1) {
            this.uniforms.mouseForce.value.copy(this.mousePosArray[this.mousePosArray.length - 1]).sub(this.mousePosArray[0]).multiplyScalar(0.8);
        }


        if (run) {
            const kernels = [this.kernels.clearGrid, this.kernels.p2g1, this.kernels.p2g2, this.kernels.updateGrid, this.kernels.g2p];
            await this.renderer.computeAsync(kernels);
        }
    }

    async captureFreezeDescriptor() {
        const count = this.numParticles || this.uniforms.numParticles.value || 0;
        const storageAttribute = this.particleBuffer?.buffer?.value;
        const positionMember = this.particleBuffer?.layout?.position;

        if (!count || !storageAttribute || !positionMember || !this.renderer?.getArrayBufferAsync) {
            return null;
        }

        const arrayBuffer = await this.renderer.getArrayBufferAsync(storageAttribute);
        const values = new Float32Array(arrayBuffer);
        const stride = this.particleBuffer.structSize;
        const positionOffset = positionMember.offset;
        const boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        const boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        const center = new THREE.Vector3();

        let validCount = 0;
        for (let i = 0; i < count; i++) {
            const baseIndex = i * stride + positionOffset;
            const x = values[baseIndex + 0];
            const y = values[baseIndex + 1];
            const z = values[baseIndex + 2];

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                continue;
            }

            center.x += x;
            center.y += y;
            center.z += z;
            boundsMin.min(new THREE.Vector3(x, y, z));
            boundsMax.max(new THREE.Vector3(x, y, z));
            validCount++;
        }

        if (validCount === 0) {
            return null;
        }

        center.divideScalar(validCount);
        const trimmedBoundsMin = boundsMin.clone().lerp(center, 0.08);
        const trimmedBoundsMax = boundsMax.clone().lerp(center, 0.08);

        return {
            center,
            boundsMin: trimmedBoundsMin,
            boundsMax: trimmedBoundsMax,
            extents: trimmedBoundsMax.clone().sub(trimmedBoundsMin),
        };
    }

    // Compat stubs for Production engineBridge/app.js integration
    setMouseInfluence(value) {
        this.uniforms.mouseInfluence.value = value;
    }
    setMouseActive(value) {
        this.uniforms.mouseActive.value = value ? 1 : 0;
    }
    prepareStartupFromVent() {}
    reseedAllParticlesFromVent() {}
    seedMatureIdlePopulation() {}
}

export default mlsMpmSimulator;
