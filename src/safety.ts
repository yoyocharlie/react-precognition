interface NetworkInformation extends EventTarget {
  saveData: boolean;
  effectiveType: "slow-2g" | "2g" | "3g" | "4g";
}

interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number; // 0.0 - 1.0
}

interface ExtendedNavigator extends Navigator {
  connection?: NetworkInformation;
  getBattery?: () => Promise<BatteryManager>;
  deviceMemory?: number; // RAM in GB
}

export const checkEnvironmentSafety = async (): Promise<boolean> => {
  const nav = navigator as ExtendedNavigator;

  // 1. DATA SAVER CHECK
  // If user explicitly asked for "Lite Mode", respect it.
  if (nav.connection?.saveData) {
    return false;
  }

  // 2. NETWORK SPEED CHECK
  // Don't clog the pipe on 2G. It blocks critical assets.
  if (
    nav.connection?.effectiveType === "2g" ||
    nav.connection?.effectiveType === "slow-2g"
  ) {
    return false;
  }

  // 3. HARDWARE CONCURRENCY CHECK
  // If the device has fewer than 4 cores, it's likely a low-end mobile device.
  // Speculating might cause main-thread jank.
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    return false;
  }

  // 4. BATTERY CHECK
  // This is async, so we wrap it safely.
  if (nav.getBattery) {
    try {
      const battery = await nav.getBattery();
      // If unplugged AND below 20%, save power.
      if (!battery.charging && battery.level < 0.2) {
        console.warn("⚠️ [Precognition] Disabled: Low Battery");
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e: unknown) {
      // If API fails, assume safe (fail-open) or unsafe (fail-closed).
      // We choose fail-open because battery API privacy restrictions often block this.
    }
  }

  return true;
};
