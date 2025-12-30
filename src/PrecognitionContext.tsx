// src/PrecognitionContext.tsx
import React, { createContext, useContext, useEffect, useRef } from "react";
import { Point } from "./vector-intent";

// A Subscriber is simply a callback function that receives the current mouse history
type SubscriberCallback = (history: Point[]) => void;

interface PrecognitionContextValue {
  /**
   * Registers a callback to be run on every global physics tick.
   * Returns a cleanup function to unsubscribe.
   */
  subscribe: (callback: SubscriberCallback) => () => void;
  isEnabled: boolean;
}

const PrecognitionContext = createContext<PrecognitionContextValue | null>(
  null
);

interface PrecognitionProviderProps {
  children: React.ReactNode;
  bufferSize?: number;
}

export const PrecognitionProvider: React.FC<PrecognitionProviderProps> = ({
  children,
  bufferSize = 20,
}) => {
  // 1. Global State
  const historyRef = useRef<Point[]>([]);
  const subscribersRef = useRef<Set<SubscriberCallback>>(new Set());
  const rAFRef = useRef<number | null>(null);
  const isEnabled = useRef(true);

  // 2. The Master Physics Loop
  const loop = () => {
    const history = historyRef.current;

    // Notify all subscribers
    // We iterate the Set directly. This is extremely fast even for 100s of items.
    subscribersRef.current.forEach((callback) => {
      callback(history);
    });

    rAFRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Touch Device Optimization: Kill the loop entirely on mobile
    if (window.matchMedia("(pointer: coarse)").matches) {
      isEnabled.current = false;
      return;
    }

    // Input Handler
    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const history = historyRef.current;
      history.push({ x: e.clientX, y: e.clientY, timestamp: now });
      if (history.length > bufferSize) history.shift();
    };

    // Start Engine
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    rAFRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
  }, [bufferSize]);

  // 3. Subscription Mechanism
  const subscribe = (callback: SubscriberCallback) => {
    subscribersRef.current.add(callback);
    // Return unsubscribe function
    return () => {
      subscribersRef.current.delete(callback);
    };
  };

  return (
    <PrecognitionContext.Provider
      value={{ subscribe, isEnabled: isEnabled.current }}
    >
      {children}
    </PrecognitionContext.Provider>
  );
};

export const usePrecognitionContext = () => {
  const context = useContext(PrecognitionContext);
  if (!context) {
    throw new Error(
      "Precognition hooks must be used within a <PrecognitionProvider>"
    );
  }
  return context;
};
