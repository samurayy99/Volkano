import type {
  CompositionMode,
  ConversationState,
  FlowEngineApi,
  FlowEngineBridgeOptions,
  LenoxEmotion,
  LenoxIntent,
  LenoxJourneyPose,
  LenoxProofState,
  LenoxReaction,
  LenoxSignatureId,
  RuntimePauseReason,
  RuntimeState,
  StudioEngineMode,
} from "./types";

type EngineDelegate = FlowEngineApi & {
  init: () => Promise<void>;
  readyAfterFirstFrame?: Promise<void>;
  runtimeState?: RuntimeState;
  setLenoxParticlesVisible?: (visible: boolean) => void;
  setLenoxOperator?: (target: number, tau?: number) => void;
  setJourneyPose?: (pose: LenoxJourneyPose, tau?: number) => void;
  setLenoxEnvironment?: (useVoid: boolean) => void;
};

type PendingCall = {
  method: keyof EngineDelegate;
  args: unknown[];
};

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private readonly mode: StudioEngineMode;
  private delegate: EngineDelegate | null = null;
  private initPromise: Promise<void> | null = null;
  private pendingCalls: PendingCall[] = [];
  private disposed = false;

  constructor(container: HTMLElement, options: FlowEngineBridgeOptions = {}) {
    this.container = container;
    this.options = options;
    this.mode = options.engineMode ?? (options.lenoxMode ? "character" : "chamber");
  }

  get runtimeState(): RuntimeState {
    if (this.disposed) return "disposed";
    return this.delegate?.runtimeState ?? (this.initPromise ? "initializing" : "cold");
  }

  get readyAfterFirstFrame(): Promise<void> {
    return this.init();
  }

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.disposed) return Promise.reject(new Error("FlowEngineBridge is disposed."));
    this.initPromise = this.loadDelegate();
    return this.initPromise;
  }

  private async loadDelegate(): Promise<void> {
    const delegate: EngineDelegate = this.mode === "field"
      ? new (await import("./fieldRuntime")).FieldRuntime(this.container, this.options)
      : new (await import("./legacyEngineBridge")).FlowEngineBridge(
          this.container,
          this.options,
        );
    if (this.disposed) {
      delegate.dispose();
      return;
    }
    this.delegate = delegate;
    const ready = delegate.readyAfterFirstFrame;
    await Promise.all([delegate.init(), ready ?? Promise.resolve()]);
    if (this.disposed) {
      delegate.dispose();
      this.delegate = null;
      return;
    }
    const pending = this.pendingCalls;
    this.pendingCalls = [];
    for (const call of pending) this.invoke(call.method, call.args);
  }

  private invoke(method: keyof EngineDelegate, args: unknown[]): void {
    if (this.disposed) return;
    const target = this.delegate;
    const fn = target?.[method];
    if (typeof fn === "function") {
      (fn as (...values: unknown[]) => void).apply(target, args);
      return;
    }
    if (!target) this.pendingCalls.push({ method, args });
  }

  setInteractiveEnabled(enabled: boolean): void { this.invoke("setInteractiveEnabled", [enabled]); }
  setPointer(x: number, y: number, isDown: boolean): void { this.invoke("setPointer", [x, y, isDown]); }
  clearPointer(): void { this.invoke("clearPointer", []); }
  beginPostEnter(): void { this.invoke("beginPostEnter", []); }
  resetCycle(): void { this.invoke("resetCycle", []); }
  setConversationState(state: ConversationState): void { this.invoke("setConversationState", [state]); }
  setChamberEnergy(level01: number): void { this.invoke("setChamberEnergy", [level01]); }
  setLenoxState(state: LenoxProofState): void { this.invoke("setLenoxState", [state]); }
  setLenoxGaze(x: number, y: number): void { this.invoke("setLenoxGaze", [x, y]); }
  setLenoxEmotion(emotion: LenoxEmotion): void { this.invoke("setLenoxEmotion", [emotion]); }
  setLenoxReaction(reaction: LenoxReaction): void { this.invoke("setLenoxReaction", [reaction]); }
  setLenoxIntent(intent: LenoxIntent): void { this.invoke("setLenoxIntent", [intent]); }
  setLenoxEyeRigEnhanced(enabled: boolean): void { this.invoke("setLenoxEyeRigEnhanced", [enabled]); }
  setLenoxParticlesVisible(visible: boolean): void { this.invoke("setLenoxParticlesVisible", [visible]); }
  setLenoxOperator(target: number, tau?: number): void { this.invoke("setLenoxOperator", [target, tau]); }
  setJourneyPose(pose: LenoxJourneyPose, tau?: number): void { this.invoke("setJourneyPose", [pose, tau]); }
  setCompositionMode(mode: CompositionMode): void { this.invoke("setCompositionMode", [mode]); }
  setLenoxEnvironment(useVoid: boolean): void { this.invoke("setLenoxEnvironment", [useVoid]); }
  setLenoxBackdropOpacity(opacity: number): void { this.invoke("setLenoxBackdropOpacity", [opacity]); }
  setSignature(id: LenoxSignatureId): void { this.invoke("setSignature", [id]); }
  setSignatureTarget(id: LenoxSignatureId): void { this.invoke("setSignatureTarget", [id]); }
  setSignatureScan(t: number): void { this.invoke("setSignatureScan", [t]); }
  commitSignature(): void { this.invoke("commitSignature", []); }
  setTransformProgress(p: number): void { this.invoke("setTransformProgress", [p]); }
  setGravityCreationProgress(p: number, reduced?: boolean): void { this.invoke("setGravityCreationProgress", [p, reduced]); }
  setGravityScrollProgress(p: number): void { this.invoke("setGravityScrollProgress", [p]); }
  suspend(reason: RuntimePauseReason = "reality"): void { this.invoke("suspend", [reason]); }
  resume(reason: RuntimePauseReason = "reality"): void { this.invoke("resume", [reason]); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingCalls = [];
    this.delegate?.dispose();
    this.delegate = null;
  }
}
