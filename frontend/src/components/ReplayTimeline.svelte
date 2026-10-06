<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, RotateCcw } from '@lucide/svelte';
  import { PlaybackClock } from '../lib/playback';
  import type { SimulationResult } from '../lib/simulation';
  let { result, step = $bindable(0), speed = $bindable(1), playing = $bindable(false), progress = $bindable(0) }: { result: SimulationResult; step?: number; speed?: number; playing?: boolean; progress?: number } = $props();
  let callback = 0;
  const clock = new PlaybackClock(untrack(() => result.snapshot.total_ticks));
  clock.seek(step); clock.progress = clock.step < clock.total ? progress : 0; clock.setSpeed(speed);
  const frame = $derived(result.frames[step]);
  const total = $derived(result.snapshot.total_ticks);
  function publish(): void { step = clock.step; progress = clock.progress; playing = clock.playing; }
  function pause(): void { clock.pause(); publish(); cancelAnimationFrame(callback); }
  function render(): void { clock.update(); publish(); if (playing) callback = requestAnimationFrame(render); }
  function play(): void { if (step === total) clock.replay(); else clock.play(); publish(); callback = requestAnimationFrame(render); }
  function seek(value: number): void { pause(); clock.seek(value); publish(); }
  function changeSpeed(value: number): void { clock.setSpeed(value); speed = value; publish(); }
  onDestroy(() => { clock.pause(); cancelAnimationFrame(callback); });
</script>
<svelte:document onvisibilitychange={() => { if (window.document.hidden) { clock.hidden(); pause(); } }} />
<section class="replay-timeline" aria-label="Simulation playback">
  <div class="playback-controls">
    <div class="playback-actions">
      <button class="icon-button" aria-label="First step" disabled={step === 0} onclick={() => seek(0)}><SkipBack size={15} /></button>
      <button class="icon-button" aria-label="Previous step" disabled={step === 0} onclick={() => seek(step - 1)}><ChevronLeft size={17} /></button>
      <button class="play-button" aria-label={playing ? 'Pause playback' : step === total ? 'Replay from start' : 'Play playback'} onclick={() => playing ? pause() : play()}>{#if playing}<Pause size={15} fill="currentColor" />{:else if step === total}<RotateCcw size={15} />{:else}<Play size={15} fill="currentColor" />{/if}<span>{playing ? 'Pause' : step === total ? 'Replay' : 'Play'}</span></button>
      <button class="icon-button" aria-label="Next step" disabled={step === total} onclick={() => seek(step + 1)}><ChevronRight size={17} /></button>
    </div>
    <span class="step-position" data-testid="step-position">Step <strong>{step}</strong> of {total}</span>
    <input class="step-scrubber" type="range" aria-label="Playback step" aria-valuetext={'Step ' + step + ' of ' + total} min="0" max={total} value={step} step="1" oninput={(event) => seek(Number(event.currentTarget.value))} />
    <label class="playback-speed">Speed<select aria-label="Playback speed" value={speed} onchange={(event) => changeSpeed(Number(event.currentTarget.value))}>{#each [1, 2, 4, 8] as value}<option value={value}>{value}×</option>{/each}</select></label>
  </div>
  <div class="cumulative-strip" data-testid="cumulative-strip"><span class="count-scope">Total through Step {step}</span><span>Generated <strong>{frame.totals.generated.toLocaleString()}</strong></span><span>Completed <strong>{frame.totals.completed.toLocaleString()}</strong></span><span>Dropped <strong>{frame.totals.dropped.toLocaleString()}</strong></span><span>In flight <strong>{frame.totals.in_flight.toLocaleString()}</strong></span></div>
</section>
