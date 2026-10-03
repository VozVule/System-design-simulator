<script lang="ts">
  let { label, controls, side, value, min, max, onchange }: {
    label: string; controls: string; side: 'left' | 'right'; value: number; min: number; max: number; onchange: (value: number) => void;
  } = $props();
  let dragging = $state(false);
  let startX = 0, startValue = 0;
  const resize = (width: number): void => onchange(Math.round(Math.max(min, Math.min(max, width))));
  function pointerdown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    event.preventDefault(); target.focus(); target.setPointerCapture(event.pointerId);
    startX = event.clientX; startValue = value; dragging = true;
  }
  function pointermove(event: PointerEvent): void {
    if (dragging) resize(startValue + (event.clientX - startX) * (side === 'left' ? 1 : -1));
  }
  function finish(event: PointerEvent): void {
    dragging = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation();
      resize(value + (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1) * (event.shiftKey ? 48 : 16));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); resize(event.key === 'Home' ? min : max);
    }
  }
</script>

<!-- A focusable separator with a value is an adjustable splitter, rather than a static separator. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="panel-divider" class:dragging role="separator" tabindex="0" aria-label={label} aria-controls={controls}
  aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={value + ' pixels'}
  title="Drag to resize · Arrow keys to adjust · Home/End for minimum/maximum"
  onpointerdown={pointerdown} onpointermove={pointermove} onpointerup={finish} onpointercancel={finish} onlostpointercapture={() => dragging = false} onkeydown={keydown}><span></span></div>
