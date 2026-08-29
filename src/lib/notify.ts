/**
 * Timer alerts. Three channels, because no single one is reliable on a phone
 * propped against a toaster:
 *
 *  • OS notification — the only one that reaches you outside the app. Needs
 *    permission, and on iPhone only works when the app is installed to the
 *    Home Screen (our manifest is already `display: standalone`).
 *  • Sound — a short WebAudio beep. No asset to ship or fail to load.
 *  • Vibration — where supported. iOS Safari has no `navigator.vibrate` at
 *    all, which is exactly why it can't be the only channel.
 *
 * Everything degrades silently; a failed alert never throws into the UI.
 */

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

/**
 * Ask for notification permission. Call this from a user gesture (starting a
 * timer) — never on page load, which browsers punish and users resent.
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotifyPermission;
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return "denied";
  }
}

/** A short two-tone beep via WebAudio — no audio file to 404. */
function beep() {
  try {
    const Ctx = (window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.28].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      // Short attack/decay envelope — a raw square edge clicks unpleasantly.
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.24);
    });
    // Release the context once the tones have played.
    setTimeout(() => { void ctx.close().catch(() => {}); }, 900);
  } catch {
    /* audio blocked or unavailable — the other channels still fire */
  }
}

/** Fire every available alert channel for a finished timer. */
export function alertTimerDone(title: string, body: string) {
  beep();

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch { /* ignore */ }

  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      // `tag` collapses repeat alerts for the same timer instead of stacking.
      new Notification(title, { body, tag: "cook-timer", icon: "/icons/icon-192.png" });
    }
  } catch { /* notification construction can throw in some embedded contexts */ }
}
