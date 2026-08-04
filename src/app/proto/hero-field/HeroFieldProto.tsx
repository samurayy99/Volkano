"use client";

import { useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../../flow-engine/engineBridge";
import {
  HERO_FIELD_LIGHT_RIG,
  HERO_FIELD_PRESET,
} from "../../../flow-engine/experienceMode";
import styles from "./HeroFieldProto.module.css";

type Ready = "pending" | "webgpu" | "fallback";

/**
 * Gate 1: A FIELD, NOT AN OBJECT.
 *
 * Isolated hero material test. Reuses the chamber MLS-MPM physics through the
 * `hero-field` experience mode and owns its own runtime, light rig and material
 * gates. It reads no production preset and touches no production route.
 */
export function HeroFieldProto() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const [ready, setReady] = useState<Ready>("pending");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      experienceMode: "hero-field",
      lenoxBackdrop: false,
      onError: (e) => console.error("[hero-field] engine error", e),
      onDeviceLost: () => setReady("fallback"),
    });
    bridgeRef.current = bridge;

    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (cancelled) return;
        setReady("webgpu");

        // Host-owned modes only toggle pointer influence here; their runtime
        // values remain under the host's authority.
        bridge.setInteractiveEnabled(true);

        // Without a Lenox drive the chamber's hot-basalt material path renders
        // and everything comes out lava red. `lenoxTintT: 1` selects the silver
        // law; the rest is this prototype's own material, not a shared preset.
        bridge.applyEngineRuntime({
          lenoxTintT: 1,
          lenoxSilverGain: 1,
          // Hero Field is reflection-led, never legacy cyan/emissive energy.
          lenoxEnergyMul: 0,
          lenoxEnvIntensity: 1,
          lenoxMetalness: HERO_FIELD_PRESET.metalness,
          lenoxRoughness: HERO_FIELD_PRESET.roughness,
          size: HERO_FIELD_PRESET.size,
          noise: HERO_FIELD_PRESET.noise,
          speed: HERO_FIELD_PRESET.speed,
          gravity: HERO_FIELD_PRESET.gravity,
          dynamicViscosity: HERO_FIELD_PRESET.dynamicViscosity,
          screenBoundsRadiusScale: HERO_FIELD_PRESET.screenBoundsRadiusScale,
          screenBoundsFill: HERO_FIELD_PRESET.screenBoundsFill,
          wallRestitution: HERO_FIELD_PRESET.wallRestitution,
          targetInfluence: HERO_FIELD_PRESET.targetInfluence,
        });

        // Faceted shards, not camera-facing quads: a billboard has one flat
        // normal, so facet specular can never appear. Candidate under test.
        bridge.setParticlePrimitive(HERO_FIELD_PRESET.primitive);
        bridge.setCoherenceField({
          inner: HERO_FIELD_PRESET.coherenceInner,
          outer: HERO_FIELD_PRESET.coherenceOuter,
          recruit: HERO_FIELD_PRESET.coherenceRecruit,
          release: HERO_FIELD_PRESET.coherenceRelease,
        });
        bridge.setHeroFieldMaterial(true);

        // Neutral rig for this instance only. The global default stays graded.
        bridge.applyLightRig(HERO_FIELD_LIGHT_RIG);
        void bridge.setEnvironment(
          HERO_FIELD_PRESET.environment,
          HERO_FIELD_PRESET.environmentRotation,
          HERO_FIELD_PRESET.environmentIntensity,
        );
      })
      .catch((e) => {
        console.warn("[hero-field] WebGPU unavailable", e);
        if (!cancelled) setReady("fallback");
      });

    // Pointer and touch feed the same path. `setPointerSample` gives the bridge
    // the smoothed speed it derives force from; `setPointer` places the impulse.
    // Nothing calls preventDefault, so touch never blocks scrolling.
    const onMove = (e: PointerEvent) => {
      bridgeRef.current?.setPointerSample(e.clientX, e.clientY);
      bridgeRef.current?.setPointer(e.clientX, e.clientY, e.pressure > 0);
    };
    const onLeave = () => bridgeRef.current?.clearPointer();

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerdown", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    host.addEventListener("pointercancel", onLeave, { passive: true });

    return () => {
      cancelled = true;
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, []);

  return (
    <main className={styles.hero}>
      <div className={styles.backwall} aria-hidden="true" />
      <div ref={hostRef} className={styles.engine} />
      {ready === "fallback" ? (
        <p className={styles.fallback}>
          WEBGPU UNAVAILABLE
        </p>
      ) : null}
    </main>
  );
}
