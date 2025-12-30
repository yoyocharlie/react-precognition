import { useCallback, useEffect, useRef, useState } from "react";
import { usePrecognitionContext } from "./PrecognitionContext";
import { checkEnvironmentSafety } from "./safety";
import {
  VectorIntentEngine,
  type Point,
  type VectorConfig,
} from "./vector-intent";

export type SpeculationStatus = "idle" | "speculating" | "ready" | "committed";

export interface PrecognitionConfig extends Partial<VectorConfig> {
  sensitivity?: number;
  gracePeriod?: number;
  debug?: boolean;
}

export interface PrecognitionResult<T> {
  commit: () => Promise<T>;
  status: SpeculationStatus;
  result: T | null;
}

export function usePrecognition<T>(
  targetRef: React.RefObject<HTMLElement | null>,
  action: (signal: AbortSignal) => Promise<T>,
  config: PrecognitionConfig = {}
): PrecognitionResult<T> {
  const { subscribe, isEnabled: isGlobalEnabled } = usePrecognitionContext();

  const {
    sensitivity = 0.5, // Tweak: Lowered from 0.6 to make triggering easier (wider angle)
    gracePeriod = 2500,
    debug = false,
    ...vectorConfig
  } = config;

  const [status, setStatus] = useState<SpeculationStatus>("idle");
  const [result, setResult] = useState<T | null>(null);
  const [isEnvironmentSafe, setSafe] = useState(true);

  // --- CRITICAL FIX 1: Synchronous State Tracking ---
  // We use this Ref to track status *immediately*, bypassing React's render cycle latency.
  // This prevents the physics loop from acting on stale "speculating" state
  // when we have already queued a "ready" update.
  const statusRef = useRef(status);

  // Keep action stable to avoid re-subscribing every render if user passes inline function
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const shadowPromise = useRef<Promise<T> | null>(null);
  const graceTimer = useRef<number | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  // The Physics Engine (Stateless instance)
  const engine = useRef(new VectorIntentEngine(vectorConfig));

  useEffect(() => {
    checkEnvironmentSafety().then((safe) => {
      setSafe(safe && isGlobalEnabled);
      if ((!safe || !isGlobalEnabled) && debug) {
        console.warn(
          "⚠️ [Precognition] Disabled: Environment or Device Unsafe"
        );
      }
    });
  }, [debug, isGlobalEnabled]);

  const transitionTo = useCallback((newStatus: SpeculationStatus) => {
    statusRef.current = newStatus; // Sync update for the physics loop
    setStatus(newStatus); // React update for the UI
  }, []);

  const triggerSpeculation = useCallback(() => {
    if (shadowPromise.current) return;
    if (debug) console.log("🔮 [Precognition] Speculating...");

    transitionTo("speculating");

    const controller = new AbortController();
    abortController.current = controller;

    // Use current action from ref
    const promise = actionRef.current(controller.signal);
    shadowPromise.current = promise;

    promise
      .then((data) => {
        if (!isMounted.current) return;
        if (shadowPromise.current === promise) {
          setResult(data);

          // CRITICAL: We only transition to ready if we aren't already committed
          if (statusRef.current !== "committed") {
            transitionTo("ready");
            if (debug) console.log("⚡ [Precognition] Ready");
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && debug) console.warn(err);
        if (isMounted.current && shadowPromise.current === promise) {
          shadowPromise.current = null;
          transitionTo("idle");
        }
      });
  }, [debug, transitionTo]);

  const cancelSpeculation = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    shadowPromise.current = null;
    transitionTo("idle");
  }, [transitionTo]);

  // --- THE TICK HANDLER ---
  const handleTick = useCallback(
    (history: Point[]) => {
      if (!targetRef.current || !isEnvironmentSafe) return;

      // 1. Calculate Score
      const rect = targetRef.current.getBoundingClientRect();
      const score = engine.current.getIntentScore(rect, history);
      // Tweak: Lowered from 0.5x to 0.4x. This makes the state "stickier" once triggered.
      const abortThreshold = sensitivity * 0.4;

      // 2. State Machine Logic
      // Always read from ref to ensure we have the absolute latest state
      const currentStatus = statusRef.current;

      if (currentStatus === "idle") {
        if (score > sensitivity) {
          triggerSpeculation();
        }
      } else if (currentStatus === "speculating") {
        if (score < abortThreshold) {
          cancelSpeculation();
        }
      } else if (currentStatus === "ready") {
        if (score < abortThreshold) {
          // Start Decay Timer
          if (!graceTimer.current) {
            graceTimer.current = window.setTimeout(() => {
              if (debug) console.log("🗑️ [Precognition] Garbage Collecting");
              setResult(null);
              shadowPromise.current = null;
              graceTimer.current = null;
              transitionTo("idle");
            }, gracePeriod);
          }
        } else {
          // Reset Decay Timer (User looked back)
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
        }
      }
    },
    [
      targetRef,
      isEnvironmentSafe,
      sensitivity,
      gracePeriod,
      triggerSpeculation,
      cancelSpeculation,
      debug,
      transitionTo,
    ]
  );

  // --- REGISTRATION ---
  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = subscribe(handleTick);

    return () => {
      isMounted.current = false;
      unsubscribe();
      if (graceTimer.current) clearTimeout(graceTimer.current);
      if (abortController.current) abortController.current.abort();
    };
  }, [subscribe, handleTick]);

  const commit = useCallback(async (): Promise<T> => {
    if (debug) console.log("👆 [Precognition] COMMIT");

    if (statusRef.current === "ready" && result) {
      transitionTo("committed");
      return result;
    }
    if (shadowPromise.current) {
      transitionTo("committed");
      return shadowPromise.current;
    }
    transitionTo("committed");
    return actionRef.current(new AbortController().signal);
  }, [result, debug, transitionTo]);

  return { commit, status, result };
}
