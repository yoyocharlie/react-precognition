import { describe, expect, it } from "vitest";
import { Point, VectorIntentEngine } from "../vector-intent";

describe("VectorIntentEngine (Stateless)", () => {
  const engine = new VectorIntentEngine();
  // Mock target: 100x100 square at (200, 200)
  const target = {
    left: 200,
    top: 200,
    right: 300,
    bottom: 300,
    width: 100,
    height: 100,
  } as DOMRect;

  it("returns 0 if history is insufficient", () => {
    const history: Point[] = [{ x: 0, y: 0, timestamp: 0 }];
    expect(engine.getIntentScore(target, history)).toBe(0);
  });

  it("returns 1.0 if cursor is inside target", () => {
    const history: Point[] = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 100, timestamp: 10 },
      { x: 250, y: 250, timestamp: 20 }, // Inside (200,200) - (300,300)
    ];
    expect(engine.getIntentScore(target, history)).toBe(1.0);
  });

  it("detects strong intent when moving fast towards target", () => {
    const history: Point[] = [
      { x: 0, y: 250, timestamp: 0 },
      { x: 50, y: 250, timestamp: 16 },
      { x: 100, y: 250, timestamp: 32 }, // Moving horizontally towards 200
    ];
    // Should be high probability
    expect(engine.getIntentScore(target, history)).toBeGreaterThan(0.5);
  });

  it("returns 0 when moving away from target", () => {
    const history: Point[] = [
      { x: 400, y: 250, timestamp: 0 },
      { x: 450, y: 250, timestamp: 16 }, // Moving right, away from 200
      { x: 500, y: 250, timestamp: 32 },
    ];
    expect(engine.getIntentScore(target, history)).toBe(0);
  });
});
