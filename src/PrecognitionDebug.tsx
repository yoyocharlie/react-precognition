import React, { useEffect, useRef } from "react";

// --- Types & Constants ---
type Point = { x: number; y: number };

// How many historical frames to visualize for the trail
const TRAIL_LENGTH = 10;
// How far ahead to project the prediction vector (visual multiplier)
const PREDICTION_MAGNITUDE = 15;

/**
 * Renders a visual "HUD" overlaying canvas on the screen.
 * It visualizes the raw mouse history (cyan trail) and a simple
 * linear extrapolation of current velocity (hot pink line).
 * * Usage: Just drop <PrecognitionDebug /> anywhere in your app tree.
 */
export const PrecognitionDebug: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // We use '!' because we know in a browser environment this context exists.
    const ctx = canvas.getContext("2d")!;

    // --- State (Mutable refs for rAF performance) ---
    let rAFId: number;
    const history: Point[] = [];

    // --- Handlers ---

    const handleResize = () => {
      // Ensure canvas always fills the viewport regardless of scroll
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      // High-frequency pushing.
      history.push({ x: e.clientX, y: e.clientY });
      // Keep history buffer fixed size. Shift is O(N) but N is tiny (10).
      if (history.length > TRAIL_LENGTH) history.shift();
    };

    // --- The Render Loop (60/120Hz) ---

    const render = () => {
      // 1. Clear previous frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // We need at least 2 points to draw a line or calculate velocity.
      if (history.length < 2) {
        rAFId = requestAnimationFrame(render);
        return;
      }

      // 2. Draw the Historical Trail (Cyan)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      // Efficiently draw connected lines from history points
      ctx.moveTo(history[0].x, history[0].y);
      for (let i = 1; i < history.length; i++) {
        ctx.lineTo(history[i].x, history[i].y);
      }
      ctx.stroke();

      // 3. Draw the Prediction Vector (Hot Pink)
      // We calculate velocity based on the oldest vs newest point in our short buffer
      // to smooth out momentary jitter.
      const start = history[0];
      const end = history[history.length - 1];

      const vx = end.x - start.x;
      const vy = end.y - start.y;

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 0, 100, 0.9)";
      ctx.lineWidth = 4;
      // Start line at current cursor position
      ctx.moveTo(end.x, end.y);
      // Project outwards
      ctx.lineTo(
        end.x + vx * PREDICTION_MAGNITUDE,
        end.y + vy * PREDICTION_MAGNITUDE
      );
      ctx.stroke();

      // Loop
      rAFId = requestAnimationFrame(render);
    };

    // --- Initialization & Cleanup ---

    // Initial setup
    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    rAFId = requestAnimationFrame(render);

    // Cleanup (Critical for preventing memory leaks and zombie event handlers)
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rAFId);
    };
  }, []); // Empty dependency array means this runs once on mount

  return (
    <canvas
      ref={canvasRef}
      style={{
        // Ensure it sits on top of everything but doesn't block clicks
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99999,
      }}
    />
  );
};
