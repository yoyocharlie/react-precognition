import React, { createContext, useContext, useEffect, useRef } from "react";
import { Point } from "./vector-intent";

interface PrecognitionContextValue {
  // We expose a Ref so consumers can read it in their animation loop
  // without triggering React renders.
  historyRef: React.MutableRefObject<Point[]>;
  isEnabled: boolean;
}

const PrecognitionContext = createContext<PrecognitionContextValue | null>(
  null
);

// Global configuration for the provider
interface PrecognitionProviderProps {
  children: React.ReactNode;
  /**
   * Max number of points to keep in the global buffer.
   * Individual hooks can use fewer, but cannot use more.
   * Default: 20
   */
  bufferSize?: number;
}

export const PrecognitionProvider: React.FC<PrecognitionProviderProps> = ({
  children,
  bufferSize = 20,
}) => {
  const historyRef = useRef<Point[]>([]);
  // We can add a global kill-switch here for touch devices later
  const isEnabled = useRef(true);

  useEffect(() => {
    // Safety check: Don't run on server
    if (typeof window === "undefined") return;

    // Mobile Optimization: Disable on touch-only devices to save resources
    const touchCheck = window.matchMedia("(pointer: coarse)");
    if (touchCheck.matches) {
      isEnabled.current = false;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const history = historyRef.current;

      history.push({ x: e.clientX, y: e.clientY, timestamp: now });

      // Keep buffer fixed size
      if (history.length > bufferSize) {
        history.shift();
      }
    };

    // Passive listener for performance
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [bufferSize]);

  return (
    <PrecognitionContext.Provider
      value={{ historyRef, isEnabled: isEnabled.current }}
    >
      {children}
    </PrecognitionContext.Provider>
  );
};

export const usePrecognitionContext = () => {
  const context = useContext(PrecognitionContext);
  if (!context) {
    throw new Error(
      "usePrecognition must be used within a PrecognitionProvider"
    );
  }
  return context;
};
