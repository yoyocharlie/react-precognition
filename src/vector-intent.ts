export interface VectorConfig {
  /** * Number of mouse events to retain for smoothing.
   * Higher = smoother but more latency.
   * Recommended: 6-10
   */
  historySize: number;

  /** * Minimum velocity (px/ms) to register as intentional movement.
   * Prevents micro-jitter from triggering calculations.
   */
  noiseThreshold: number;

  /**
   * The distance (px) at which intent begins to decay to zero.
   */
  maxInfluenceDistance: number;

  /**
   * How much weight to give to the "Deceleration" signal (0.0 - 1.0).
   * If the user slows down while aiming, how much does that boost confidence?
   */
  decelerationWeight: number;
}

const DEFAULT_CONFIG: VectorConfig = {
  historySize: 6,
  noiseThreshold: 0.05,
  maxInfluenceDistance: 800,
  decelerationWeight: 0.3,
};

type Point = { x: number; y: number; timestamp: number };

export class VectorIntentEngine {
  private history: Point[] = [];
  private readonly config: VectorConfig;

  constructor(config: Partial<VectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ingests a new mouse event.
   * Efficiently manages the history buffer.
   */
  public update(e: MouseEvent): void {
    const now = performance.now();

    // Immutable update pattern not needed here; performance is priority.
    // We mutate the array for O(1) push access, shift is O(n) but n is tiny (6).
    this.history.push({ x: e.clientX, y: e.clientY, timestamp: now });

    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  /**
   * Resets the engine state. Call this on mouseleave or component unmount.
   */
  public reset(): void {
    this.history = [];
  }

  /**
   * The Core Algorithm.
   * Calculates probability (0-1) that the user is aiming for this target.
   */
  public getIntentScore(targetRect: DOMRect): number {
    // 1. DATA SUFFICIENCY CHECK
    if (this.history.length < 3) return 0; // Need at least 3 points for acceleration

    const current = this.history[this.history.length - 1];

    // 2. HIT TEST (The "Already There" Case)
    if (
      current.x >= targetRect.left &&
      current.x <= targetRect.right &&
      current.y >= targetRect.top &&
      current.y <= targetRect.bottom
    ) {
      return 1.0;
    }

    // 3. TARGET GEOMETRY
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const dx = targetCenterX - current.x;
    const dy = targetCenterY - current.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    // Optimization: Early exit if too far away
    if (distanceToTarget > this.config.maxInfluenceDistance) return 0;

    // 4. VELOCITY & ACCELERATION PHYSICS
    // We split history into two halves to compare "recent past" vs "current" speed.
    const midIndex = Math.floor(this.history.length / 2);

    const startPoint = this.history[0];
    const midPoint = this.history[midIndex];
    const endPoint = current;

    // Velocity 1 (Earlier)
    const dt1 = midPoint.timestamp - startPoint.timestamp;
    const dist1 = Math.hypot(
      midPoint.x - startPoint.x,
      midPoint.y - startPoint.y
    );
    const speed1 = dt1 > 0 ? dist1 / dt1 : 0;

    // Velocity 2 (Current)
    const dt2 = endPoint.timestamp - midPoint.timestamp;
    const vx = dt2 > 0 ? (endPoint.x - midPoint.x) / dt2 : 0;
    const vy = dt2 > 0 ? (endPoint.y - midPoint.y) / dt2 : 0;
    const speed2 = Math.hypot(vx, vy);

    // Noise filter
    if (speed2 < this.config.noiseThreshold) return 0;

    // 5. VECTOR ALIGNMENT (The "Aim")
    // Normalize vectors
    const vxn = vx / speed2;
    const vyn = vy / speed2;
    const dxn = dx / distanceToTarget;
    const dyn = dy / distanceToTarget;

    // Dot Product: -1 (away) to 1 (towards)
    const alignment = vxn * dxn + vyn * dyn;

    // If moving away or perpendicular, 0 intent.
    if (alignment <= 0) return 0;

    // 6. SCORING HEURISTICS

    // A. Alignment Score (The "Aim" Signal)
    const alignmentScore = Math.pow(alignment, 3);

    // B. Distance Decay (Linear falloff)
    const distanceScore =
      1 - distanceToTarget / this.config.maxInfluenceDistance;

    // C. Deceleration Bonus (The "Stopping" Signal)
    // If speed is decreasing (speed2 < speed1) AND we are aimed correctly (alignment > 0.8)
    let decelerationBonus = 0;
    if (speed2 < speed1 && alignment > 0.8) {
      // Calculate ratio of slowing down.
      // If speed dropped by 50%, ratio is 0.5.
      const brakingRatio = 1 - speed2 / speed1;
      decelerationBonus =
        Math.min(brakingRatio, 1) * this.config.decelerationWeight;
    }

    // 7. FINAL COMPOSITE SCORE
    // Base formula: (Aim * Proximity) + Braking_Bonus
    const totalScore = alignmentScore * distanceScore + decelerationBonus;

    // Clamp between 0 and 1
    return Math.min(Math.max(totalScore, 0), 1);
  }
}
