🔮 React Precognition (v2)

Stop reacting. Start predicting.
A single-loop, zero-overhead predictive engine for React.

The Problem:
Standard Web: User Clicks (0ms) → Network Request (200ms) → UI Update. Latency: 200ms.

The Solution:
Precognition: Cursor Intent (-200ms) → Network Request (200ms) → User Clicks (0ms) → UI Update. Latency: 0ms.

🚀 What's New in v2?

The "Game Loop" Architecture.
Previous versions (and other libraries) attach a mousemove listener for every interactive element. If you had 50 links, you had 50 listeners thrashing the main thread.

v2 changes the game. We use a single global physics loop (like a game engine).

1 Button: 1 unit of CPU.

1,000 Buttons: ~1 unit of CPU.

O(1) Scaling: Drop this on large data grids or mega-menus without fear.

📦 Installation

pnpm add react-precognition

# or

npm install react-precognition

🛠 Usage

1. The Provider (The Brain)

Wrap your app (or a specific subtree) in the PrecognitionProvider. This initializes the single event listener.

// App.tsx
import { PrecognitionProvider } from 'react-precognition';

export default function App() {
return (
<PrecognitionProvider>
<YourApp />
</PrecognitionProvider>
);
}

2. The Hook (The Sensor)

Use the hook on any interactive element.

import { useRef } from 'react';
import { usePrecognition } from 'react-precognition';

const SmartButton = () => {
const ref = useRef<HTMLButtonElement>(null);

// Define the speculative action (Must be idempotent! GET requests only.)
const prefetchData = async (signal: AbortSignal) => {
return await fetch('/api/user-details', { signal });
};

const { commit, status } = usePrecognition(ref, prefetchData);

return (
<button ref={ref} onClick={commit}>
View Profile
{status === 'ready' && <span className="badge">Preloaded!</span>}
</button>
);
};

🎛 The Tuning Guide (Knobs & Dials)

You don't need to know vector math. You just need to know how to adjust the "feel."

sensitivity (0.0 to 1.0)

The "Trigger Finger." Controls how confident the engine must be before it speculates.

Default: 0.6

⬇ Lower (0.3): Trigger happy. Will fire if the user vaguely waves in the direction of the button. Good for high-priority, low-cost actions.

⬆ Higher (0.9): Sniper mode. Will only fire if the user is moving fast and directly at the center of the button. Good for "heavy" actions you don't want to waste.

maxInfluenceDistance (pixels)

The "Cone of Vision." How far away can the cursor be and still trigger the button?

Default: 800

⬇ Lower (200): Short-sighted. User must be close to the button. Reduces "cross-fire" if you have many buttons close together.

⬆ Higher (1500): Eagle-eyed. Detects intent from across the screen.

gracePeriod (ms)

The "Short-Term Memory." If the user intends to click, but then twitches their mouse away for a split second, how long do we hold the result?

Default: 2500

⬇ Lower (500): Brutal. If they look away, we trash the data immediately. Saves RAM, but might cause re-fetching.

⬆ Higher (5000): Forgiving. Keeps the preloaded data alive longer.

historySize (integer)

The "Smoothing" Factor. How many frames of mouse history do we analyze?

Default: 6

⬇ Lower (3): Highly reactive. Instantly detects direction changes, but prone to "jitter" (noise).

⬆ Higher (12): Very smooth. Ignores hand tremors, but feels slightly "laggy" to detect sudden turns.

decelerationWeight (0.0 to 1.0)

The "Braking" Bonus.

Default: 0.3

If the user is moving towards the button AND slowing down (preparing to stop/click), we boost the intent score. Increase this if you want to capture "slow and steady" approachers.

⚠️ Safety & Best Practices

Idempotency is Law:

✅ DO: Fetch data, load code chunks, pre-connect to sockets.

❌ DO NOT: Delete records, buy items, sign out.

Why? The user might aim at the button, trigger the action, and then change their mind. You cannot "un-delete" a record easily.

Mobile/Touch:

This library automatically disables itself on touch devices. You don't need to do anything. We save the user's battery by killing the physics loop on mobile.

Visual Feedback:

We recommend not showing loading spinners during speculation. It confuses users ("I didn't click yet!").

Instead, use the status to perhaps subtly highlight the button or change the cursor, signaling "I am ready."

API Reference

const {
commit, // Function: Call this in your real onClick handler. Returns the Promise.
status, // String: 'idle' | 'speculating' | 'ready' | 'committed'
result // Any: The data returned from your async action (if ready)
} = usePrecognition(ref, action, config);

Config Object

{
sensitivity?: number; // Default: 0.6
gracePeriod?: number; // Default: 2500 (ms)
historySize?: number; // Default: 6 (frames)
noiseThreshold?: number; // Default: 0.05 (px/ms)
maxInfluenceDistance?: number; // Default: 800 (px)
decelerationWeight?: number; // Default: 0.3
debug?: boolean; // Default: false (Logs events to console)
}
