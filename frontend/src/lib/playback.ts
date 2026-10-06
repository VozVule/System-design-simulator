/** A display clock over immutable recorded frames, independent of simulation calculation. */
export class PlaybackClock {
  step = 0; progress = 0; speed = 1; playing = false;
  private origin = 0; private originPosition = 0;
  constructor(readonly total: number, private readonly now: () => number = () => performance.now()) {}
  play(): void { if (!this.playing && this.step < this.total) { this.playing = true; this.resetOrigin(); } }
  pause(): void { this.update(); this.playing = false; }
  seek(step: number): void { this.pause(); this.step = Math.max(0, Math.min(this.total, Math.floor(step))); this.progress = 0; }
  setSpeed(speed: number): void { this.update(); this.speed = speed; this.resetOrigin(); }
  replay(): void { this.seek(0); this.play(); }
  hidden(): void { this.pause(); }
  update(): number {
    if (this.playing) {
      const position = Math.min(this.total, this.originPosition + Math.max(0, this.now() - this.origin) * this.speed / 1000);
      this.step = Math.floor(position); this.progress = position - this.step;
      if (this.step === this.total) { this.playing = false; this.progress = 0; }
    }
    return this.step;
  }
  private resetOrigin(): void { this.origin = this.now(); this.originPosition = this.step + this.progress; }
}
