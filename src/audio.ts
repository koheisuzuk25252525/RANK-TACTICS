import type { CombatEvent } from "./engine";
// Synthesized locally: no asset download, and playback begins only after a user gesture.
let context: AudioContext | undefined;
export function unlockAudio() {
  context ??= new AudioContext();
  void context.resume();
}
export function playCombat(event: CombatEvent) {
  if (!context || context.state !== "running") return;
  const t = context.currentTime;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.type = event.kind === "kill" ? "sawtooth" : "triangle";
  const start =
    event.kind === "shot"
      ? 180
      : event.kind === "contact"
        ? 650
        : event.kind === "kill"
          ? 85
          : 110;
  oscillator.frequency.setValueAtTime(start, t);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(25, start / 3),
    t + 0.12,
  );
  gain.gain.setValueAtTime(event.kind === "shot" ? 0.04 : 0.065, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(t);
  oscillator.stop(t + 0.2);
}
