// src/usePrecognition.ts
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
  // 1. Connect to the Hive Mind
  const { subscribe, isEnabled: isGlobalEnabled } = usePrecognitionContext();

  const {
    sensitivity = 0.6,
    gracePeriod = 2500,
    debug = false,
    ...vectorConfig
  } = config;

  const [status, setStatus] = useState<SpeculationStatus>("idle");
  const [result, setResult] = useState<T | null>(null);
  const [isEnvironmentSafe, setSafe] = useState(true);

  // Mutable refs for state to be accessible inside the stable callback
  const statusRef = useRef(status);
  const shadowPromise = useRef<Promise<T> | null>(null);
  const graceTimer = useRef<number | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  // Sync state to ref
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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

  // --- ACTIONS (Same as v1) ---
  const triggerSpeculation = useCallback(() => {
    if (shadowPromise.current) return;
    if (debug) console.log("🔮 [Precognition] Speculating...");

    setStatus("speculating");
    const controller = new AbortController();
    abortController.current = controller;

    const promise = action(controller.signal);
    shadowPromise.current = promise;

    promise
      .then((data) => {
        if (!isMounted.current) return;
        if (shadowPromise.current === promise) {
          setResult(data);
          setStatus((prev) => (prev === "committed" ? "committed" : "ready"));
          if (debug) console.log("⚡ [Precognition] Ready");
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && debug) console.warn(err);
        if (isMounted.current && shadowPromise.current === promise) {
          setStatus("idle");
          shadowPromise.current = null;
        }
      });
  }, [action, debug]);

  const cancelSpeculation = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    shadowPromise.current = null;
    setStatus("idle");
  }, []);

  // --- THE TICK HANDLER (v3 logic) ---
  // This function runs every frame, called by the Provider.
  const handleTick = useCallback(
    (history: Point[]) => {
      if (!targetRef.current || !isEnvironmentSafe) return;

      // 1. Calculate Score
      const rect = targetRef.current.getBoundingClientRect();
      const score = engine.current.getIntentScore(rect, history);
      const abortThreshold = sensitivity * 0.5;

      // 2. State Machine Logic
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
              setStatus("idle");
              setResult(null);
              shadowPromise.current = null;
              graceTimer.current = null;
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
    ]
  );

  // --- REGISTRATION ---
  useEffect(() => {
    isMounted.current = true;
    // Subscribe to the global loop
    const unsubscribe = subscribe(handleTick);

    return () => {
      isMounted.current = false;
      unsubscribe(); // Remove from provider
      if (graceTimer.current) clearTimeout(graceTimer.current);
      if (abortController.current) abortController.current.abort();
    };
  }, [subscribe, handleTick]);

  const commit = useCallback(async (): Promise<T> => {
    if (status === "ready" && result) {
      setStatus("committed");
      return result;
    }
    if (shadowPromise.current) {
      setStatus("committed");
      return shadowPromise.current;
    }
    setStatus("committed");
    return action(new AbortController().signal);
  }, [status, result, action]);

  return { commit, status, result };
}
