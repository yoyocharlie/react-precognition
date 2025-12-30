export interface VectorConfig {
  /**
   * Number of mouse events to retain for smoothing.
   * NOTE: In the global provider model, the provider determines the max history size.
   */
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

  // REMOVED: update(e) and this.history
  // The engine is now a "Pure Calculator" for a specific target configuration.

  /**
   * Calculates probability (0-1) that the user is aiming for this target.
   * @param targetRect The bounding box of the interactive element
   * @param globalHistory The shared history buffer from the global provider
   */
  public getIntentScore(targetRect: DOMRect, globalHistory: Point[]): number {
    // 1. DATA SUFFICIENCY CHECK
    // We use the configured history size, or whatever is available if less.
    const relevantHistory = globalHistory.slice(-this.config.historySize);

    if (relevantHistory.length < 3) return 0;

    const current = relevantHistory[relevantHistory.length - 1];

    // 2. HIT TEST
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

    if (distanceToTarget > this.config.maxInfluenceDistance) return 0;

    // 4. PHYSICS
    const midIndex = Math.floor(relevantHistory.length / 2);
    const startPoint = relevantHistory[0];
    const midPoint = relevantHistory[midIndex];
    const endPoint = current;

    // Velocity 1 (Past)
    const dt1 = midPoint.timestamp - startPoint.timestamp;
    // Fix: Prevent division by zero if events fire in same tick
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
