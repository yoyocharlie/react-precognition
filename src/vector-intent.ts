export interface VectorConfig {
  /** Number of history points to use for calculation. */
  historySize: number;
  noiseThreshold: number;
  maxInfluenceDistance: number;
  decelerationWeight: number;
}

export const DEFAULT_CONFIG: VectorConfig = {
  historySize: 6,
  noiseThreshold: 0.05,
  maxInfluenceDistance: 800,
  decelerationWeight: 0.3,
};

export type Point = { x: number; y: number; timestamp: number };

export class VectorIntentEngine {
  private readonly config: VectorConfig;

  constructor(config: Partial<VectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Pure calculation. No side effects.
   */
  public getIntentScore(targetRect: DOMRect, globalHistory: Point[]): number {
    // 1. Slice the relevant history for this specific component's config
    const relevantHistory = globalHistory.slice(-this.config.historySize);

    // Need at least 3 points for velocity/acceleration math
    if (relevantHistory.length < 3) return 0;

    const current = relevantHistory[relevantHistory.length - 1];

    // 2. HIT TEST (User is already inside)
    if (
      current.x >= targetRect.left &&
      current.x <= targetRect.right &&
      current.y >= targetRect.top &&
      current.y <= targetRect.bottom
    ) {
      return 1.0;
    }

    // 3. DISTANCE CHECK
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const dx = targetCenterX - current.x;
    const dy = targetCenterY - current.y;
    // Fast distance check (hypot is slightly slower than manual sqrt, but cleaner)
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    if (distanceToTarget > this.config.maxInfluenceDistance) return 0;

    // 4. PHYSICS
    const midIndex = Math.floor(relevantHistory.length / 2);
    const startPoint = relevantHistory[0];
    const midPoint = relevantHistory[midIndex];
    const endPoint = current;

    // Velocity 1 (Past)
    const dt1 = midPoint.timestamp - startPoint.timestamp;
    const speed1 =
      dt1 > 0
        ? Math.hypot(midPoint.x - startPoint.x, midPoint.y - startPoint.y) / dt1
        : 0;

    // Velocity 2 (Current)
    const dt2 = endPoint.timestamp - midPoint.timestamp;
    const vx = dt2 > 0 ? (endPoint.x - midPoint.x) / dt2 : 0;
    const vy = dt2 > 0 ? (endPoint.y - midPoint.y) / dt2 : 0;
    const speed2 = Math.hypot(vx, vy);

    if (speed2 < this.config.noiseThreshold) return 0;

    // 5. ALIGNMENT
    const vxn = vx / speed2;
    const vyn = vy / speed2;
    const dxn = dx / distanceToTarget;
    const dyn = dy / distanceToTarget;
    const alignment = vxn * dxn + vyn * dyn;

    if (alignment <= 0) return 0;

    // 6. SCORING
    const alignmentScore = Math.pow(alignment, 3);
    const distanceScore =
      1 - distanceToTarget / this.config.maxInfluenceDistance;

    let decelerationBonus = 0;
    if (speed2 < speed1 && alignment > 0.8) {
      const brakingRatio = 1 - speed2 / speed1;
      decelerationBonus =
        Math.min(brakingRatio, 1) * this.config.decelerationWeight;
    }

    const totalScore = alignmentScore * distanceScore + decelerationBonus;
    return Math.min(Math.max(totalScore, 0), 1);
  }
}
