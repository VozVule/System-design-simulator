<script lang="ts">
  import { ComponentType } from './lib/domain/component-types';
  import { RoutingPolicy } from './lib/domain/routing-policies';
  import { onDestroy, onMount, tick } from 'svelte';
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import { Plus, Save, FolderOpen, ArrowUpRight, ArrowRight, ChevronUp, ChevronDown, X, Trash2, SlidersHorizontal, Network, Check, Circle, LoaderCircle, RefreshCw, Layers, PencilLine, Play, Film } from '@lucide/svelte';
  import Canvas from './components/Canvas.svelte';
  import ComponentIcon from './components/ComponentIcon.svelte';
  import Field from './components/Field.svelte';
  import Modal from './components/Modal.svelte';
  import PanelDivider from './components/PanelDivider.svelte';
  import ReplayTimeline from './components/ReplayTimeline.svelte';
  import ReplayInspector from './components/ReplayInspector.svelte';
  import { copySelection, duplicateSelection, readSelectionClipboard, selectionBounds } from './lib/clipboard';
  import { ArchitectureError, isRouterComponent, catalog, clone, connect, destinations, equal, newComponent, removeElements, reorder, typeName, weightPercent } from './lib/domain';
  import type { ArchitectureDocument, ArchitectureSummary } from './lib/domain';
  import { applySaveErrors, captureSave, clearElementDrafts, editField, fieldValue, finishSave, isDirty, newEditor, openEditor } from './lib/editor';
  import { HttpArchitectureStore } from './lib/http-storage';
  import { DEFAULT_TOTAL_STEPS, HttpSimulation, mapRunIssues, parseTotalSteps, RunRequests } from './lib/simulation';
  import type { SimulationResult, RunIssue } from './lib/simulation';
  import type { ArchitectureStore } from './lib/storage';

  let { store = new HttpArchitectureStore() }: { store?: ArchitectureStore } = $props();
  let editor = $state.raw(newEditor());
  let selected = $state<string[]>([]), selectMode = $state(false), canvas: Canvas;
  let libraryOpen = $state(false), library = $state<ArchitectureSummary[]>([]), loading = $state(false), libraryError = $state('');
  let error = $state(''), saveFailed = $state(false), saving = $state(false), navigationSaving = $state(false), opening = $state(false), deleting = $state(false), awaitingAction = $state(false);
  let pendingSave: Promise<boolean> | null = null;
  type Navigation = { type: 'new' } | { type: 'open'; id: string };
  let navigation = $state<Navigation | null>(null), deleteTarget = $state<ArchitectureSummary | null>(null);
  let connectionTarget = $state(''), redirectSource = $state(''), redirectTarget = $state('');
  let paletteWidth = $state(246), inspectorWidth = $state(286), workspaceWidth = $state(1280);
  let clipboardText = '', pasteCount = 0;
  let clipboardNotice = $state('');
  let replay = $state(false), result = $state.raw<SimulationResult | null>(null), replayStep = $state(0), replaySpeed = $state(1);
  let replayPlaying = $state(false), replayProgress = $state(0);
  let totalSteps = $state(DEFAULT_TOTAL_STEPS), stepsDraft = $state(String(DEFAULT_TOTAL_STEPS)), calculating = $state(false), runError = $state(''), runIssues = $state<RunIssue[]>([]), simulationNotice = $state(''), runCancelled = $state(false);
  const requests = new RunRequests(), simulation = new HttpSimulation();
  const stepsError = $derived(parseTotalSteps(stepsDraft) === null ? 'Enter a positive safe whole number of steps.' : '');
  const panelSpace = $derived(Math.max(264, workspaceWidth - 216));
  const shownInspector = $derived(Math.min(inspectorWidth, Math.max(200, panelSpace - 64)));
  const shownPalette = $derived(replay ? 0 : Math.min(paletteWidth, Math.max(64, panelSpace - shownInspector)));
  const paletteMax = $derived(Math.max(64, Math.min(400, workspaceWidth - shownInspector - 216)));
  const inspectorMax = $derived(Math.max(200, Math.min(480, workspaceWidth - shownPalette - 216)));
  const dirty = $derived(isDirty(editor));
  const locked = $derived(navigationSaving || opening || deleting);
  const document = $derived(editor.write.document);
  const shownDocument = $derived(replay && result ? result.snapshot.document : document);
  const replayFrame = $derived(replay && result ? result.frames[replayStep] : undefined);
  const snapshotChanged = $derived(!!result && !equal(document, result.snapshot.document));
  const node = $derived(document.nodes.find((item) => selected.length === 1 && item.id === selected[0]));
  const edge = $derived(document.edges.find((item) => selected.length === 1 && item.id === selected[0]));
  const router = $derived(!!node && isRouterComponent(node));
  const outgoing = $derived(node ? destinations(document, node.id) : []);
  const status = $derived(saving ? 'Saving…' : saveFailed ? 'Save failed' : dirty ? 'Unsaved changes' : editor.id ? 'Saved' : 'New architecture');
  const saveDisabled = $derived(saving || locked || (!dirty && !!editor.id) || Object.keys(editor.errors).length > 0);

  $effect(() => { selected; connectionTarget = ''; redirectSource = edge?.source ?? ''; redirectTarget = edge?.target ?? ''; });
  $effect(() => {
    if (!dirty && !saving) return;
    const leave = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  });
  onMount(() => { void refreshLibrary(); });
  onDestroy(() => requests.reset());
  const message = (cause: unknown): string => cause instanceof Error ? cause.message : 'The operation could not complete. Your work is intact.';
  function changeDocument(next: ArchitectureDocument): void {
    if (!locked && !replay) { editor = { ...editor, write: { ...editor.write, document: next } }; error = ''; saveFailed = false; runIssues = runIssues.map((issue) => ({ ...issue, field: undefined })); }
  }
  function field(key: string, text: string): void { if (!locked && (!replay || key === 'name')) { editor = editField(editor, key, text); error = ''; saveFailed = false; runIssues = runIssues.map((issue) => issue.field === key ? { ...issue, field: undefined } : issue); } }
  function fieldError(key: string): string | undefined { return editor.errors[key] ?? runIssues.find((issue) => issue.field === key)?.message; }
  function switchMode(value: boolean): void {
    if (value && !result) return;
    replay = value;
    if (!value) replayPlaying = false;
    const ids = new Set([...shownDocument.nodes, ...shownDocument.edges].map((item) => item.id)); selected = selected.filter((id) => ids.has(id));
    simulationNotice = value ? 'Replay mode. The recorded architecture is read-only.' : 'Edit mode. Your working architecture is ready to edit.';
  }
  function setSteps(text: string): void { stepsDraft = text; const value = parseTotalSteps(text); if (value !== null) totalSteps = value; }
  function resetSimulation(): void { requests.reset(); calculating = false; replay = false; result = null; replayStep = 0; replaySpeed = 1; replayPlaying = false; replayProgress = 0; totalSteps = DEFAULT_TOTAL_STEPS; stepsDraft = String(DEFAULT_TOTAL_STEPS); runError = ''; runIssues = []; simulationNotice = ''; runCancelled = false; }
  function cancelRun(): void { requests.cancel(); calculating = false; runError = ''; runIssues = []; runCancelled = true; simulationNotice = 'Run cancelled. Your document and previous result have been kept.'; }
  async function run(): Promise<void> {
    if (locked || replay || calculating) return;
    const drafts = Object.entries(editor.errors).filter(([key]) => key !== 'name');
    if (drafts.length || stepsError) {
      runError = stepsError || 'Correct these fields before Run: ' + drafts.map(([key]) => (document.nodes.find((node) => node.id === key.split(':')[1])?.label ?? 'Connection') + ' · ' + key.split(':')[2].replaceAll('_', ' ')).join(', ') + '.';
      runIssues = []; return;
    }
    const request = requests.begin(document, totalSteps);
    calculating = true; runError = ''; runIssues = []; runCancelled = false; simulationNotice = 'Calculating simulation…';
    try {
      const accepted = await simulation.run(request.input, request.controller.signal);
      if (!requests.accepts(request)) return;
      requests.finish(request); calculating = false;
      result = accepted; replayStep = 0; replaySpeed = 1; replayPlaying = false; replayProgress = 0; switchMode(true); simulationNotice = 'Simulation complete. Replay is paused at Step 0.';
      await tick(); if (replay && result === accepted) void canvas.fit();
    } catch (cause) {
      if (!requests.accepts(request)) return;
      runError = message(cause); simulationNotice = 'Simulation failed. Your document and previous result have been kept.';
      if (cause instanceof ArchitectureError) runIssues = mapRunIssues(cause.response.error.details, request.input.document, document);
    } finally { if (requests.accepts(request)) { requests.finish(request); calculating = false; } }
  }
  function select(ids: string[]): void { if (!equal([...selected].sort(), [...ids].sort())) selected = ids; }
  function clipboardAvailable(event: ClipboardEvent): boolean {
    const target = event.target;
    return !locked && !replay && !libraryOpen && !navigation && !deleteTarget && !(target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  }
  function copy(event: ClipboardEvent): void {
    const components = document.nodes.filter((item) => selected.includes(item.id));
    if (!clipboardAvailable(event) || !components.length || !event.clipboardData) return;
    event.preventDefault();
    try {
      const text = copySelection(editor, selected);
      event.clipboardData.setData('text/plain', text); clipboardText = text; pasteCount = 0;
      clipboardNotice = `Copied ${components.length === 1 ? components[0].label : components.length + ' components'}. Paste with Ctrl/Cmd+V.`;
    } catch (cause) { error = message(cause); }
  }
  function paste(event: ClipboardEvent): void {
    if (!clipboardAvailable(event) || !event.clipboardData) return;
    const text = event.clipboardData.getData('text/plain');
    try {
      const copied = readSelectionClipboard(text); if (!copied) return;
      event.preventDefault();
      if (clipboardText !== text) { clipboardText = text; pasteCount = 0; }
      const bounds = selectionBounds(copied), pasted = duplicateSelection(document, copied, canvas.pastePosition(bounds, ++pasteCount, bounds));
      changeDocument({ ...clone(document), nodes: [...document.nodes, ...pasted.nodes], edges: [...document.edges, ...pasted.edges] });
      selected = [...pasted.nodes, ...pasted.edges].map((item) => item.id);
      if (pasted.nodes.length === 1) void canvas.focusComponent(pasted.nodes[0].id);
      else void canvas.focusSelection(pasted.nodes.map((item) => item.id));
      clipboardNotice = `Pasted ${pasted.nodes.length === 1 ? pasted.nodes[0].label : pasted.nodes.length + ' components'}.`;
    } catch (cause) { event.preventDefault(); error = message(cause); }
  }
  function add(type: ComponentType, at?: { x: number; y: number }): void {
    if (locked || replay) return;
    const point = at ?? canvas.center();
    const existing = document.nodes.filter((n) => Math.abs(n.position.x - point.x) < 210 && Math.abs(n.position.y - point.y) < 135).length;
    const component = newComponent(type, at ? point : { x: point.x + existing * 26, y: point.y + existing * 30 });
    const count = document.nodes.filter((n) => n.type === type).length;
    if (count) component.label += ' ' + (count + 1);
    changeDocument({ ...clone(document), nodes: [...document.nodes, component] }); selected = [component.id];
  }
  function positions(items: { id: string; x: number; y: number }[]): void {
    if (locked || replay) return;
    const next = clone(document), moved: string[] = [];
    for (const item of items) {
      const n = next.nodes.find((n) => n.id === item.id);
      if (n && !equal(n.position, { x: item.x, y: item.y })) { n.position = { x: item.x, y: item.y }; moved.push(item.id); }
    }
    if (!moved.length) return;
    changeDocument(next);
    const drafts = { ...editor.drafts }, errors = { ...editor.errors };
    for (const id of moved) for (const axis of ['x', 'y']) { delete drafts[`node:${id}:${axis}`]; delete errors[`node:${id}:${axis}`]; }
    editor = { ...editor, drafts, errors };
  }
  function connection(source: string, target: string, oldId?: string): void {
    if (locked || replay) return;
    try { changeDocument(connect(document, source, target, undefined, oldId)); }
    catch (cause) { error = message(cause); }
  }
  function remove(nodes: string[], edges: string[]): void {
    if (locked || replay) return;
    const next = removeElements(document, nodes, edges);
    const removed = [...nodes, ...document.edges.filter((e) => !next.edges.some((n) => n.id === e.id)).map((e) => e.id)];
    changeDocument(next); editor = clearElementDrafts(editor, removed); selected = selected.filter((id) => !removed.includes(id));
  }
  async function refreshLibrary(): Promise<void> {
    loading = true; libraryError = '';
    try { library = await store.list(); }
    catch (cause) { libraryError = message(cause); }
    finally { loading = false; }
  }
  function save(): Promise<boolean> {
    if (pendingSave) return pendingSave;
    let snapshot;
    try { snapshot = captureSave(editor); }
    catch (cause) { error = message(cause); return Promise.resolve(false); }
    const id = editor.id;
    saving = true; saveFailed = false; error = '';
    pendingSave = (async () => {
      try {
        const result = id ? await store.replace(id, snapshot) : await store.create(snapshot);
        editor = finishSave(editor, snapshot, result);
        saving = false;
        void refreshLibrary(); return true;
      } catch (cause) {
        if (cause instanceof ArchitectureError) editor = applySaveErrors(editor, snapshot, cause.response.error.details);
        error = message(cause); saveFailed = true; return false;
      }
      finally { saving = false; pendingSave = null; }
    })();
    return pendingSave;
  }
  async function requestNavigation(action: Navigation): Promise<void> {
    if (locked || navigation || awaitingAction) return;
    awaitingAction = true;
    try {
      if (pendingSave) await pendingSave;
      if (dirty) navigation = action;
      else await navigate(action);
    } finally { awaitingAction = false; }
  }
  async function navigate(action: Navigation): Promise<void> {
    if (action.type === 'new') { resetSimulation(); editor = newEditor(); selected = []; error = ''; saveFailed = false; libraryOpen = false; }
    else {
      opening = true;
      try { const resource = await store.get(action.id); resetSimulation(); editor = openEditor(resource); selected = []; error = ''; saveFailed = false; libraryOpen = false; await tick(); await canvas.fit(); }
      catch (cause) { error = message(cause); await refreshLibrary(); }
      finally { opening = false; }
    }
  }
  async function resolveNavigation(choice: 'save' | 'discard'): Promise<void> {
    const action = navigation; if (!action || locked) return;
    if (choice === 'save') {
      navigationSaving = true;
      const succeeded = await save(); navigationSaving = false;
      if (!succeeded) return;
    }
    navigation = null; await navigate(action);
  }
  async function askDelete(item: ArchitectureSummary): Promise<void> {
    if (locked || deleteTarget || awaitingAction) return;
    awaitingAction = true;
    try { if (pendingSave) await pendingSave; deleteTarget = item; }
    finally { awaitingAction = false; }
  }
  async function confirmDelete(): Promise<void> {
    const item = deleteTarget; if (!item || deleting) return;
    deleting = true; error = '';
    try {
      await store.delete(item.id);
      if (editor.id === item.id) { resetSimulation(); editor = newEditor(); selected = []; saveFailed = false; }
      deleteTarget = null; await refreshLibrary();
    } catch (cause) { error = message(cause); }
    finally { deleting = false; }
  }
  function keydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); if (!locked && !navigation && !deleteTarget && !saveDisabled) void save();
    }
    if (event.key.toLowerCase() === 'v' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !locked && !libraryOpen && !navigation && !deleteTarget
      && !(event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) {
      event.preventDefault(); selectMode = !selectMode;
    }
    if (event.key === 'Escape' && !navigation && !deleteTarget) libraryOpen = false;
  }
  function drag(event: DragEvent, type: ComponentType): void {
    event.dataTransfer?.setData('application/sysd-component', type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  const date = (value: string): string => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window onkeydown={keydown} oncopy={copy} onpaste={paste} />

<div class="studio">
  <header class="app-header">
    <div class="brand" aria-label="System Design Studio"><span class="brand-icon"><Network size={21} /></span><span>System Design<span class="brand-subtitle">STUDIO</span></span></div>
    <div class="header-divider"></div>
    <div class="architecture-title"><PencilLine size={14} /><input aria-label="Architecture name" value={fieldValue(editor, 'name', editor.write.name)} aria-invalid={!!editor.errors.name} oninput={(e) => field('name', e.currentTarget.value)} disabled={locked} autocomplete="off" /></div>
    <span class="save-state" class:changed={dirty || saveFailed} class:saving={saving} class:saved={!!editor.id && !dirty && !saveFailed && !saving} role="status">{#if saving}<LoaderCircle size={13} class="spin" />{:else if editor.id && !dirty && !saveFailed}<Check size={13} />{:else}<Circle size={7} fill="currentColor" />{/if}{status}</span>
    <nav class="header-actions" aria-label="Architecture actions"><button class="quiet" onclick={() => requestNavigation({ type: 'new' })} disabled={locked}><Plus size={16} />New</button><button class="quiet" class:active={libraryOpen} onclick={() => { libraryOpen = !libraryOpen; if (libraryOpen) void refreshLibrary(); }} disabled={locked}><FolderOpen size={16} />Library</button><button class="primary" class:save-complete={!!editor.id && !dirty && !saving && !saveFailed} aria-busy={saving} aria-label={saveFailed ? "Retry Save" : "Save"} onclick={save} disabled={saveDisabled}>{#if saving}<LoaderCircle size={16} class="spin" />{:else if editor.id && !dirty && !saveFailed}<Check size={16} />{:else}<Save size={16} />{/if}{saving ? 'Saving…' : saveFailed ? 'Retry Save' : editor.id && !dirty ? 'Saved' : 'Save'}<kbd>⌘ S</kbd></button></nav>
  </header>

  <main class="workspace" class:replay-workspace={replay} bind:clientWidth={workspaceWidth} style:--palette-width={shownPalette + 'px'} style:--inspector-width={shownInspector + 'px'}>
    {#if !replay}
    <aside id="component-palette" class="palette" aria-label="Component palette">
      <div class="panel-heading"><span class="eyebrow">BUILD YOUR SYSTEM</span><h2>Components</h2><p>Drag onto the canvas or click to add.</p></div>
      <div class="component-list">{#each catalog as item}<button class="palette-component" draggable={!locked} ondragstart={(event) => drag(event, item.type)} onclick={() => add(item.type)} disabled={locked} aria-label={'Add ' + item.name}><span class="component-icon" style:--component-color={item.color}><ComponentIcon type={item.type} /></span><span class="component-copy"><strong>{item.name}</strong><small>{item.description}</small></span><Plus size={14} class="add-mark" /></button>{/each}</div>
      <div class="palette-note"><Layers size={17} /><div><strong>Designed one step at a time</strong><p>Incomplete architectures can be saved. Connect and configure them whenever you’re ready.</p></div></div>
      <div class="palette-bottom"><span class="release-tag">RELEASE 1</span><span>Architecture editor</span></div>
    </aside>

    <PanelDivider label="Resize component palette" controls="component-palette" side="left" value={shownPalette} min={64} max={paletteMax} onchange={(value) => paletteWidth = value} />
    {/if}

    <div class="canvas-column">
      <div class="simulation-toolbar">
        <div class="mode-switch" aria-label="Workspace mode"><button aria-pressed={!replay} onclick={() => switchMode(false)}><PencilLine size={14} />Edit</button><button aria-pressed={replay} disabled={!result} onclick={() => switchMode(true)}><Film size={14} />Replay</button></div>
        {#if replay && result}<span class="run-setting">Recorded · {result.snapshot.total_ticks} steps{#if totalSteps !== result.snapshot.total_ticks}<small>Next Run: {totalSteps} steps</small>{/if}</span><button class="secondary" onclick={() => switchMode(false)}>Edit and run again<ArrowRight size={14} /></button>
        {:else}<label class="steps-setting">Total steps<input aria-label="Total steps" inputmode="numeric" value={stepsDraft} aria-invalid={!!stepsError} aria-describedby={stepsError ? 'steps-error' : undefined} oninput={(event) => setSteps(event.currentTarget.value)} /></label><button class="primary run-action" disabled={locked || calculating} aria-busy={calculating} onclick={run}>{#if calculating}<LoaderCircle size={14} class="spin" />Calculating…{:else}<Play size={14} />Run{/if}</button>{/if}
        {#if calculating}<button class="quiet" onclick={cancelRun}>Cancel Run</button>{/if}
      </div>
      {#if !replay && stepsError}<p id="steps-error" class="run-input-error">{stepsError}</p>{/if}
      {#if runCancelled}<div class="run-cancelled"><span>Run cancelled. Your document and previous result have been kept.</span><button aria-label="Dismiss cancellation notice" onclick={() => runCancelled = false}><X size={15} /></button></div>{/if}
      {#if replay && snapshotChanged}<div class="snapshot-note">Replay uses an earlier architecture. Return to Edit to run your changes.</div>{/if}
      {#if runError}<div class="error-banner run-error" role="alert"><span>{runError}</span><button aria-label="Dismiss Run error" onclick={() => { runError = ''; runIssues = []; }}><X size={16} /></button></div>{/if}
      {#if runIssues.length}<div class="validation-banner run-issues" aria-label="Run validation details">{#each runIssues as issue}<button disabled={!issue.id || ![...document.nodes, ...document.edges].some((item) => item.id === issue.id)} onclick={() => { switchMode(false); if (issue.id) selected = [issue.id]; }}>{issue.message}</button>{/each}</div>{/if}
      {#if error}<div class="error-banner" role="alert"><span>{error}</span>{#if saveFailed}<button onclick={save} disabled={saveDisabled}>Retry Save</button>{/if}<button aria-label="Dismiss error" onclick={() => error = ''}><X size={16} /></button></div>{/if}
      {#if !replay && Object.keys(editor.errors).length}<div class="validation-banner" role="alert">{#each Object.entries(editor.errors) as [key, issue]}<button onclick={() => { if (key !== 'name') selected = [key.split(':')[1]]; }}>{key === 'name' ? 'Architecture name' : document.nodes.find((n) => n.id === key.split(':')[1])?.label ?? 'Connection'}: {issue}</button>{/each}</div>{/if}
      <SvelteFlowProvider><Canvas bind:this={canvas} document={shownDocument} {selected} {selectMode} {locked} readonly={replay} frame={replayFrame} progress={replayProgress} playing={replayPlaying} totalSteps={result?.snapshot.total_ticks ?? 0} onmodechange={(value) => selectMode = value} onselect={select} onpositions={positions} onconnect={connection} onremove={remove} onadd={add} /></SvelteFlowProvider>
      {#if replay && result}{#key result}<ReplayTimeline {result} bind:step={replayStep} bind:speed={replaySpeed} bind:playing={replayPlaying} bind:progress={replayProgress} />{/key}{/if}
    </div>

    <PanelDivider label="Resize configuration inspector" controls="configuration-inspector" side="right" value={shownInspector} min={200} max={inspectorMax} onchange={(value) => inspectorWidth = value} />

    <aside id="configuration-inspector" class="inspector" aria-label="Configuration inspector">
      <div class="inspector-heading"><span><SlidersHorizontal size={17} />Inspector</span>{#if selected.length}<button class="icon-button" aria-label="Clear selection" onclick={() => selected = []}><X size={16} /></button>{/if}</div>
      {#if replay && result}<ReplayInspector {result} step={replayStep} {selected} />{:else}
      <fieldset disabled={locked}>
      {#if node}
        <div class="inspector-content"><div class="selected-kind"><ComponentIcon type={node.type} /><span>{typeName(node.type)}</span></div><h2>{node.label}</h2><p class="inspector-intro">Configure this component.</p>
          <Field label="Label" value={fieldValue(editor, `node:${node.id}:label`, node.label)} error={fieldError(`node:${node.id}:label`)} oninput={(text) => field(`node:${node.id}:label`, text)} />
          <div class="section-label">CONFIGURATION</div>
          {#if node.type === ComponentType.CALLER_GROUP}
            <Field label="Caller count" numeric value={fieldValue(editor, `node:${node.id}:caller_count`, node.caller_count)} error={fieldError(`node:${node.id}:caller_count`)} oninput={(text) => field(`node:${node.id}:caller_count`, text)} />
            <Field label="Total test RPS" numeric value={fieldValue(editor, `node:${node.id}:test_rps`, node.test_rps)} error={fieldError(`node:${node.id}:test_rps`)} oninput={(text) => field(`node:${node.id}:test_rps`, text)} hint="Total requests per second across the entire caller group." />
          {:else}<Field label="Maximum RPS" numeric value={fieldValue(editor, `node:${node.id}:capacity_rps`, node.capacity_rps)} error={fieldError(`node:${node.id}:capacity_rps`)} oninput={(text) => field(`node:${node.id}:capacity_rps`, text)} />{/if}
          {#if isRouterComponent(node)}<div class="form-field"><label for="routing">Routing policy</label><select id="routing" value={node.routing_policy} onchange={(e) => { const next = clone(document), n = next.nodes.find((n) => n.id === node.id); if (n && isRouterComponent(n)) { n.routing_policy = e.currentTarget.value === RoutingPolicy.WEIGHTED ? RoutingPolicy.WEIGHTED : RoutingPolicy.ROUND_ROBIN; changeDocument(next); } }}><option value={RoutingPolicy.ROUND_ROBIN}>Round-robin</option><option value={RoutingPolicy.WEIGHTED}>Weighted split</option></select></div>{/if}
          <div class="section-label">{router ? 'DESTINATIONS' : 'CONNECTIONS'}<span>{outgoing.length}</span></div>
          {#if outgoing.length}{#each outgoing as destination, index}<div class="destination-row"><div class="destination-name"><button onclick={() => selected = [destination.id]}><ArrowUpRight size={14} />{document.nodes.find((n) => n.id === destination.target)?.label}</button>{#if router}<div class="order-buttons"><button aria-label={'Move up destination ' + (index + 1)} disabled={index === 0} onclick={() => changeDocument(reorder(document, destination.id, -1))}><ChevronUp size={13} /></button><button aria-label={'Move down destination ' + (index + 1)} disabled={index === outgoing.length - 1} onclick={() => changeDocument(reorder(document, destination.id, 1))}><ChevronDown size={13} /></button></div>{/if}</div>{#if isRouterComponent(node) && node.routing_policy === RoutingPolicy.WEIGHTED}<div class="weight-row"><Field label={'Weight for ' + (document.nodes.find((n) => n.id === destination.target)?.label ?? 'destination')} compact numeric value={fieldValue(editor, `edge:${destination.id}:weight`, destination.weight)} error={fieldError(`edge:${destination.id}:weight`)} oninput={(text) => field(`edge:${destination.id}:weight`, text)} /><span>{weightPercent(document, destination)?.toFixed(1) ?? '—'}%</span></div>{/if}</div>{/each}{:else}<p class="muted">No outgoing connections yet.</p>{/if}
          {#if router && node && 'routing_policy' in node && node.routing_policy === RoutingPolicy.WEIGHTED && outgoing.length && outgoing.every((e) => e.weight === 0)}<p class="incomplete-hint">All weights are zero. You can save this draft and finish routing later.</p>{/if}
          {#if node.type !== ComponentType.DATABASE}<div class="connection-controls"><label for="connect-target">Connect to</label><select id="connect-target" bind:value={connectionTarget}><option value="">Choose a component…</option>{#each document.nodes as target}<option value={target.id}>{target.label}</option>{/each}</select><button class="primary inspector-action" disabled={!connectionTarget} onclick={() => { if (node) connection(node.id, connectionTarget); }}>Connect<ArrowRight size={14} /></button></div>{/if}
          <p class="copy-hint">Select on the canvas, then Ctrl/Cmd+C to copy and Ctrl/Cmd+V to paste.</p>
          <button class="danger-text" onclick={() => { if (node) remove([node.id], []); }}><Trash2 size={14} />Remove component</button>
        </div>
      {:else if edge}
        <div class="inspector-content"><div class="selected-kind"><ArrowUpRight size={20} /><span>Directed connection</span></div><h2>Connection</h2><p class="inspector-intro">Change the path through your system.</p>
          <div class="form-field"><label for="redirect-source">Source</label><select id="redirect-source" bind:value={redirectSource}>{#each document.nodes as source}<option value={source.id}>{source.label}</option>{/each}</select></div>
          <div class="form-field"><label for="redirect-target">Target</label><select id="redirect-target" bind:value={redirectTarget}>{#each document.nodes as target}<option value={target.id}>{target.label}</option>{/each}</select></div>
          <button class="primary inspector-action full-width" onclick={() => { if (edge) connection(redirectSource, redirectTarget, edge.id); }}>Redirect connection<ArrowRight size={14} /></button>
          {#if document.nodes.some((n) => n.id === edge.source && isRouterComponent(n) && n.routing_policy === RoutingPolicy.WEIGHTED)}<Field label="Relative weight" numeric value={fieldValue(editor, `edge:${edge.id}:weight`, edge.weight)} error={fieldError(`edge:${edge.id}:weight`)} oninput={(text) => field(`edge:${edge.id}:weight`, text)} hint="Relative weights may be fractional or zero; they do not need to sum to 100." />{/if}
          <div class="connection-meta"><span>Destination order</span><strong>{edge.order}</strong></div><p class="field-hint">Adjust destination order from the source component’s inspector.</p>
          <button class="danger-text" onclick={() => { if (edge) remove([], [edge.id]); }}><Trash2 size={14} />Remove connection</button>
        </div>
      {:else if selected.length > 1}
        <div class="inspector-content"><h2>{selected.length} items selected</h2><p class="inspector-intro">Drag the selection to move it. Press Delete to remove it.</p><p class="copy-hint">Ctrl/Cmd+C to copy this group. Ctrl/Cmd+V to paste it.</p><button class="danger-text" onclick={() => remove(document.nodes.filter((n) => selected.includes(n.id)).map((n) => n.id), document.edges.filter((e) => selected.includes(e.id)).map((e) => e.id))}><Trash2 size={14} />Remove selected items</button></div>
      {:else}
        <div class="inspector-empty"><div class="inspector-illustration"><SlidersHorizontal size={28} strokeWidth={1.4} /></div><h3>A closer look.</h3><p>Select a component or connection<br />to edit its properties.</p></div>
        <div class="inspector-tip"><span class="eyebrow">GOOD TO KNOW</span><p>Keep your graph acyclic.<br />Each arrow defines a direction<br />for traffic to follow.</p></div>
      {/if}
      </fieldset>
      {/if}
    </aside>
  </main>

  <footer class="app-footer"><span><span class="local-dot"></span>Local workspace</span><span>{shownDocument.nodes.length} components<span class="footer-dot">·</span>{shownDocument.edges.length} connections</span><span>{store.storageKind === 'backend' ? 'Saved to local library' : 'Saved in this browser'}<span class="footer-dot">·</span>{replay ? 'Read-only replay' : 'Architecture editor'}</span></footer>
</div>


<div class="visually-hidden" aria-live="polite" aria-atomic="true">{clipboardNotice}</div>
<div class="visually-hidden" aria-live="polite" aria-atomic="true">{simulationNotice}</div>

{#if libraryOpen}
  <Modal title="Architecture library" oncancel={() => libraryOpen = false}>
    <p class="dialog-description">{store.storageKind === 'backend' ? 'Saved architectures are stored by the local backend and can be reopened from this library.' : 'Browser-local placeholders. Saved architectures stay in this browser profile and frontend origin.'}</p>
    <div class="library-toolbar"><span>{library.length} saved {library.length === 1 ? 'architecture' : 'architectures'}</span><button class="quiet" onclick={refreshLibrary} disabled={loading}><RefreshCw size={14} />Refresh</button></div>
    {#if loading}<p class="library-empty">Loading your library…</p>{:else if libraryError}<div class="dialog-error" role="alert">{libraryError}<button onclick={refreshLibrary}>Retry</button></div>{:else if !library.length}<div class="library-empty"><FolderOpen size={28} /><h3>Your next idea belongs here.</h3><p>Save an architecture to find it in your library.</p><button class="secondary" onclick={() => { libraryOpen = false; void requestNavigation({ type: 'new' }); }}><Plus size={15} />New architecture</button></div>{:else}<div class="library-list">{#each library as item}<div class="library-item"><div class="library-item-icon"><Network size={19} /></div><div class="library-item-copy"><strong>{item.name}</strong><span>Saved {date(item.updated_at)}</span><small>Created {date(item.created_at)} · {item.id.slice(0, 8)}</small></div><button class="secondary" disabled={locked} aria-label={'Open ' + item.name + ' ' + item.id.slice(0, 8)} onclick={() => { libraryOpen = false; void requestNavigation({ type: 'open', id: item.id }); }}>Open</button><button class="icon-button delete-button" disabled={locked} aria-label={'Delete ' + item.name + ' ' + item.id.slice(0, 8)} onclick={() => { libraryOpen = false; void askDelete(item); }}><Trash2 size={16} /></button></div>{/each}</div>{/if}
    <div class="dialog-actions"><button class="secondary" onclick={() => libraryOpen = false}>Close</button></div>
  </Modal>
{/if}

{#if navigation}
  <Modal title="Keep your changes?" oncancel={() => { if (!navigationSaving) navigation = null; }}>
    <p class="dialog-description">“{fieldValue(editor, 'name', editor.write.name)}” has unsaved changes. Save them before continuing, or discard them.</p>
    {#if error}<p class="dialog-error" role="alert">{error}</p>{/if}
    {#if Object.keys(editor.errors).length}<p class="dialog-error">Some fields are invalid. Cancel to correct them before saving.</p>{/if}
    <div class="dialog-actions"><button class="quiet" disabled={navigationSaving} onclick={() => navigation = null}>Cancel</button><button class="secondary" disabled={navigationSaving} onclick={() => resolveNavigation('discard')}>Discard</button><button class="primary" disabled={navigationSaving || Object.keys(editor.errors).length > 0} onclick={() => resolveNavigation('save')}>{navigationSaving ? 'Saving…' : 'Save and continue'}</button></div>
  </Modal>
{/if}
{#if deleteTarget}
  <Modal title="Delete saved architecture?" oncancel={() => { if (!deleting) deleteTarget = null; }}>
    <p class="dialog-description">Delete “{deleteTarget.name}” from the {store.storageKind === 'backend' ? 'local architecture' : 'browser’s saved'} library?{#if deleteTarget.id === editor.id} The active editor will be reset.{#if dirty} Its unsaved changes will also be discarded.{/if}{/if} This cannot be undone.</p>
    {#if error}<p class="dialog-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions"><button class="secondary" disabled={deleting} onclick={() => deleteTarget = null}>Cancel</button><button class="danger" disabled={deleting} onclick={confirmDelete}>{deleting ? 'Deleting…' : 'Delete architecture'}</button></div>
  </Modal>
{/if}
