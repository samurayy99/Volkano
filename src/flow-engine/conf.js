import * as THREE from "three/webgpu";

class Conf {
    gui = null;
    fpsValueEl = null;
    maxParticles = 8192 * 16;
    particles = 8192 * 4;

    bloom = false;

    run = true;
    noise = 1.0;
    speed = 1;
    stiffness = 3;
    restDensity = 1;
    density = 1;
    dynamicViscosity = 0.1;
    gravity = 0;
    gravitySensorReading = new THREE.Vector3();
    accelerometerReading = new THREE.Vector3();
    attractionStrength = 0;    // 0 = off (play), 3.0 = full (locked)
    attractionDamping = 1.0;   // 1.0 = no damping, 0.94 = convergence damping
    attractionPower = 0.7;     // distance exponent
    targetFieldCenter = new THREE.Vector2(32, 32);
    targetFieldSpan = new THREE.Vector2(60, 60);
    fieldFade = 0;         // 0 = all particles visible, 1 = distance-based fade active
    gridVelocityScale = 1.0;  // 1.0 = full MLS-MPM, 0.05 = field-dominant
    convergenceScale = 1.0;    // 1.0 = play size, 0.35 = locked (particle shrink)
    convergenceDepthScale = 1.0; // 1.0 = full rod depth, <1 compresses rod depth for clearer glyphs
    colorSaturation = 1.0;     // 1.0 = full color, 0.08 = near-monochrome
    zFlattenStrength = 0.0;    // 0.0 = off, 1.0 = aggressive servo flatten
    emissiveIntensity = 0;     // 0 = play (no glow), >0 = text particles self-illuminate
    textFramingScale = 1.0;    // additional composition shrink for final readable lock-state framing
    spotlightIntensity = 0.0;  // spotlight-like center weighting for transform/crystallize reveal
    edgeOrganicBreakup = 0.0;  // subtle stable per-particle irregularity (no temporal flicker)
    foregroundSupportAmount = 0.0; // 0..1 central/dock particle suppression around authored text
    foregroundSupportCenter = new THREE.Vector2(32, 31); // grid-space support mask centre
    foregroundSupportRadius = new THREE.Vector2(15.5, 12.5); // grid-space support mask extents
    simSubsteps = 1;           // compute substeps per frame (higher = more stable convergence)
    reactorPull = 0.0;         // 0..1 blend into dock reactor attraction flow
    reactorStrength = 0.0;     // 0..3 reactor attraction force scalar
    reactorRadius = 8.0;       // 1.5..12 reactor attraction radius in grid units
    reactorTargetGrid = new THREE.Vector3(8, 56, 30); // top-left dock target in sim space
    auraOpacityCap = 1.0;      // explicit render cap for particle aura opacity
    auraEmissiveCap = 1.0;     // explicit render cap for particle aura emissive
    auraSizeScale = 1.0;       // explicit render cap for particle aura footprint
    sceneBackgroundLerp = 1.0; // 0 = muted #e2dfd8, 1 = bright #f4f2ec
    trailStretch = 0.0;        // 0 = normal rods, 0..1.2 = velocity-proportional streak elongation
    backgroundDarkness = 0.0;  // 0 = no effect, 1 = scene bg fully dark (#0a0a0c)
    pointerWake = 0.0;         // 0 = old directional push, 1 = radial push + wake swirl
    particleDebugMode = "off"; // off|source|freshness|binding|hover|walls
    craterUV = new THREE.Vector2(0.488, 0.714); // authoritative crater anchor, bottom-origin backplate UV
    ventDepthOffset = 0.042; // chamber-local distance in front of the backplate
    ventRadiiLocal = new THREE.Vector3(0.042, 0.066, 0.024); // backplate/vessel-local source footprint
    ventAxisLocal = new THREE.Vector3(0.012, 0.978, -0.208); // chamber-local eruption axis
    ventCenter = new THREE.Vector3(23.2, 30.6, 18.4); // derived sim-space source center
    ventRadii = new THREE.Vector3(4.2, 3.2, 2.8); // derived sim-space source radii
    ventAxis = new THREE.Vector3(-0.16, 0.94, 0.3); // derived sim-space source axis
    ventSpawnJitter = 0.18;
    sourceBindStrength = 0.78;
    sourceLiftStrength = 1.02;
    mouthRadiusScale = 0.58;
    mouthBindStrength = 1.34;
    mouthLiftStrength = 0.42;
    throatHeight = 9.8;
    throatSpread = 1.18;
    throatLiftStrength = 1.04;
    wallGlideStrength = 0.7;
    startupDelay = 0.18;
    startupDuration = 1.55;
    startupLatentVisibility = 0.05;
    startupProgress = 0.0;
    startupStateMix = 1.0;    // 1 = startup-only gating active, 0 = full play ecology active
    freshnessDecayRate = 0.05;
    freshnessRespawnThreshold = 0.02;
    freshnessReleaseStart = 0.82;
    freshnessReleaseEnd = 0.38;
    sourceConfinementStrength = 0.0; // soft 3D source-volume shaping in play state
    sourceFieldCenter = new THREE.Vector3(27.0, 33.0, 18.5);
    sourceFieldRadii = new THREE.Vector3(18.0, 21.5, 14.5);
    sourceFieldSecondaryCenter = new THREE.Vector3(36.0, 29.0, 26.0);
    sourceFieldSecondaryRadii = new THREE.Vector3(10.5, 13.5, 10.0);
    chamberFlowStrength = 0.0; // room-scale circulation field for whole-chamber travel
    chamberReturnStrength = 0.0; // soft recentering so particles return after wall travel
    wallBounceStrength = 0.0; // normal-axis rebound energy when particles hit chamber bounds
    wallSplashStrength = 0.0; // tangential rebound energy when particles hit chamber bounds
    chamberFlowCenter = new THREE.Vector3(32.0, 32.0, 30.0);
    chamberFlowRadii = new THREE.Vector3(27.0, 23.0, 23.0);
    sourceDepthScale = 1.0;    // additional play-state depth exaggeration for volumetric read
    activeFieldIndex = 0;      // index into interleaved field buffer (0=mountain, 1=hero, 2=logo)
    eruptImpulse = 0.0;        // one-frame Y-velocity burst (unused in play, kept for shader compat)

    diagOverrideOpacity = false; // T-key diagnostic

    isMobile = false;
    actualSize = 1;
    size = 1;

    frameStartMs = 0;
    lastFpsMs = 0;
    framesSinceLast = 0;

    constructor() {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            this.maxParticles = 8192 * 8;
            this.particles = 4096;
            this.isMobile = true;
        }
        this.updateParams();
    }

    updateParams() {
        const level = Math.max(this.particles / 8192, 1);
        const size = 1.6 / Math.pow(level, 1 / 3);
        this.actualSize = size * this.size;
        this.restDensity = 0.25 * level * this.density;
    }

    setupGravitySensor() {
        if (this.gravitySensor || typeof GravitySensor === "undefined") {
            return;
        }
        this.gravitySensor = new GravitySensor({ frequency: 60 });
        this.gravitySensor.addEventListener("reading", () => {
            this.gravitySensorReading.copy(this.gravitySensor).divideScalar(50);
            this.gravitySensorReading.setY(this.gravitySensorReading.y * -1);
        });
        this.gravitySensor.start();
    }

    init() {
        if (this.gui) {
            return;
        }
        if (typeof window !== 'undefined' && !new URLSearchParams(window.location.search).has('debug')) {
            return;
        }

        const panel = document.createElement("div");
        panel.style.position = "absolute";
        panel.style.top = "12px";
        panel.style.right = "12px";
        panel.style.width = "240px";
        panel.style.background = "rgba(27, 29, 36, 0.82)";
        panel.style.border = "1px solid rgba(255, 255, 255, 0.15)";
        panel.style.borderRadius = "8px";
        panel.style.color = "#d9dbe3";
        panel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
        panel.style.fontSize = "12px";
        panel.style.padding = "8px";
        panel.style.zIndex = "15";

        const statsTitle = document.createElement("div");
        statsTitle.textContent = "stats";
        statsTitle.style.fontWeight = "700";
        statsTitle.style.marginBottom = "6px";
        panel.appendChild(statsTitle);

        const fpsRow = document.createElement("div");
        fpsRow.style.display = "flex";
        fpsRow.style.justifyContent = "space-between";
        fpsRow.style.marginBottom = "8px";
        fpsRow.innerHTML = "<span>fps</span>";
        const fpsValue = document.createElement("span");
        fpsValue.textContent = "--";
        fpsRow.appendChild(fpsValue);
        panel.appendChild(fpsRow);
        this.fpsValueEl = fpsValue;

        const settingsTitle = document.createElement("div");
        settingsTitle.textContent = "settings";
        settingsTitle.style.fontWeight = "700";
        settingsTitle.style.margin = "6px 0";
        panel.appendChild(settingsTitle);

        panel.appendChild(this.createRange("particles", 4096, this.maxParticles, 4096, this.particles, (value) => {
            this.particles = value;
            this.updateParams();
        }));

        panel.appendChild(this.createRange("size", 0.5, 2, 0.1, this.size, (value) => {
            this.size = value;
            this.updateParams();
        }));

        panel.appendChild(this.createCheck("bloom", this.bloom, (checked) => {
            this.bloom = checked;
        }));

        const simTitle = document.createElement("div");
        simTitle.textContent = "simulation";
        simTitle.style.fontWeight = "700";
        simTitle.style.margin = "8px 0 6px 0";
        panel.appendChild(simTitle);

        panel.appendChild(this.createCheck("run", this.run, (checked) => {
            this.run = checked;
        }));

        panel.appendChild(this.createRange("noise", 0, 2, 0.01, this.noise, (value) => {
            this.noise = value;
        }));

        panel.appendChild(this.createRange("speed", 0.1, 2, 0.1, this.speed, (value) => {
            this.speed = value;
        }));

        document.body.appendChild(panel);
        this.gui = panel;
    }

    createRange(label, min, max, step, initialValue, onChange) {
        const row = document.createElement("label");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr 72px";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.marginBottom = "6px";

        const name = document.createElement("span");
        name.textContent = label;
        row.appendChild(name);

        const input = document.createElement("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(initialValue);
        input.addEventListener("input", () => {
            onChange(Number(input.value));
        });
        row.appendChild(input);

        return row;
    }

    createCheck(label, initialValue, onChange) {
        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.marginBottom = "6px";

        const name = document.createElement("span");
        name.textContent = label;
        row.appendChild(name);

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = initialValue;
        input.addEventListener("change", () => {
            onChange(input.checked);
        });
        row.appendChild(input);

        return row;
    }

    update() {
    }

    begin() {
        this.frameStartMs = performance.now();
    }

    end() {
        this.framesSinceLast += 1;
        const now = performance.now();
        if (this.lastFpsMs === 0) {
            this.lastFpsMs = now;
        }
        const elapsed = now - this.lastFpsMs;
        if (elapsed >= 500) {
            const fps = Math.round((this.framesSinceLast * 1000) / elapsed);
            if (this.fpsValueEl) {
                this.fpsValueEl.textContent = `${fps} FPS`;
            }
            this.framesSinceLast = 0;
            this.lastFpsMs = now;
        }
    }

    dispose() {
        if (this.gui && this.gui.parentElement) {
            this.gui.parentElement.removeChild(this.gui);
        }
        this.gui = null;
        this.fpsValueEl = null;
        if (this.gravitySensor) {
            this.gravitySensor.stop();
            this.gravitySensor = null;
        }
    }
}

export const conf = new Conf();
