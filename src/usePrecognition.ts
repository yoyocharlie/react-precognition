import { useCallback, useEffect, useRef, useState } from "react";
import { usePrecognitionContext } from "./PrecognitionContext";
import { checkEnvironmentSafety } from "./safety";
import { VectorIntentEngine, type VectorConfig } from "./vector-intent";

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
  // 1. CONSUME CONTEXT
  const { historyRef, isEnabled: isGlobalEnabled } = usePrecognitionContext();

  const {
    sensitivity = 0.6,
    gracePeriod = 2500,
    debug = false,
    ...vectorConfig
  } = config;

  const [status, setStatus] = useState<SpeculationStatus>("idle");
  const [result, setResult] = useState<T | null>(null);
  const [isEnvironmentSafe, setSafe] = useState(true);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const engine = useRef<VectorIntentEngine>(
    new VectorIntentEngine(vectorConfig)
  );

  const shadowPromise = useRef<Promise<T> | null>(null);
  const graceTimer = useRef<number | null>(null);
  const isMounted = useRef(true);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    checkEnvironmentSafety().then((safe) => {
      // Logic AND: Global Toggle (Touch check) && Environment Check (Battery/DataSaver)
      setSafe(safe && isGlobalEnabled);
      if ((!safe || !isGlobalEnabled) && debug)
        console.warn(
          "⚠️ [Precognition] Disabled: Environment Unsafe or Touch Device"
        );
    });
  }, [debug, isGlobalEnabled]);

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
        if (err.name === "AbortError") {
          if (debug) console.log("🛑 [Precognition] Speculation Aborted");
        } else {
          if (debug) console.warn("Speculation failed", err);
        }

        if (isMounted.current) {
          if (shadowPromise.current === promise) {
            setStatus("idle");
            shadowPromise.current = null;
          }
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

  // 2. THE PHYSICS LOOP
  useEffect(() => {
    if (!isEnvironmentSafe) return;

    isMounted.current = true;
    let rAFId: number;
    const abortThreshold = sensitivity * 0.5;

    const checkIntent = () => {
      // Loop Management
      rAFId = requestAnimationFrame(checkIntent);

      if (!targetRef.current) return;

      // GET HISTORY FROM CONTEXT REF (O(1), no React overhead)
      const currentHistory = historyRef.current;

      // Optimization: Don't calculate if mouse hasn't moved (history is empty or stale)
      // (Optional: You could store lastTimestamp and check against history[last].timestamp)

      const rect = targetRef.current.getBoundingClientRect();

      // PASS HISTORY TO ENGINE
      const score = engine.current.getIntentScore(rect, currentHistory);

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
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
        }
      }
    };

    // Start Loop
    rAFId = requestAnimationFrame(checkIntent);

    return () => {
      isMounted.current = false;
      cancelAnimationFrame(rAFId);
      if (graceTimer.current) clearTimeout(graceTimer.current);
      if (abortController.current) abortController.current.abort();
    };
  }, [
    targetRef,
    sensitivity,
    gracePeriod,
    triggerSpeculation,
    cancelSpeculation,
    debug,
    isEnvironmentSafe,
    historyRef, // Added historyRef dependency
  ]);

  const commit = useCallback(async (): Promise<T> => {
    if (debug) console.log("👆 [Precognition] COMMIT Triggered");

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
  }, [status, result, action, debug]);

  return { commit, status, result };
}
