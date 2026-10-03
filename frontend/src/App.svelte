<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import { Plus, Save, FolderOpen, ArrowUpRight, ArrowRight, ChevronUp, ChevronDown, X, Trash2, SlidersHorizontal, Network, Check, Circle, LoaderCircle, RefreshCw, Layers, PencilLine } from '@lucide/svelte';
  import Canvas from './components/Canvas.svelte';
  import ComponentIcon from './components/ComponentIcon.svelte';
  import Field from './components/Field.svelte';
  import Modal from './components/Modal.svelte';
  import { catalog, clone, connect, destinations, equal, newComponent, removeElements, reorder, typeName, weightPercent } from './lib/domain';
  import type { ArchitectureDocument, ArchitectureSummary, ComponentType } from './lib/domain';
  import { captureSave, clearElementDrafts, discardEditor, editField, fieldValue, finishSave, isDirty, newEditor, openEditor } from './lib/editor';
  import { BrowserArchitectureStore } from './lib/storage';
  import type { ArchitectureStore } from './lib/storage';

  let { store = new BrowserArchitectureStore() }: { store?: ArchitectureStore } = $props();
  let editor = $state.raw(newEditor());
  let selected = $state<string | null>(null), canvas: Canvas;
  let libraryOpen = $state(false), library = $state<ArchitectureSummary[]>([]), loading = $state(false), libraryError = $state('');
  let error = $state(''), saveFailed = $state(false), saving = $state(false), navigationSaving = $state(false), opening = $state(false), deleting = $state(false), awaitingAction = $state(false);
  let pendingSave: Promise<boolean> | null = null;
  type Navigation = { type: 'new' } | { type: 'open'; id: string };
  let navigation = $state<Navigation | null>(null), deleteTarget = $state<ArchitectureSummary | null>(null);
  let connectionTarget = $state(''), redirectSource = $state(''), redirectTarget = $state('');
  const dirty = $derived(isDirty(editor));
  const locked = $derived(navigationSaving || opening || deleting);
  const document = $derived(editor.write.document);
  const node = $derived(document.nodes.find((item) => item.id === selected));
  const edge = $derived(document.edges.find((item) => item.id === selected));
  const router = $derived(node?.type === 'load_balancer' || node?.type === 'gateway');
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
  const message = (cause: unknown): string => cause instanceof Error ? cause.message : 'The operation could not complete. Your work is intact.';
  function changeDocument(next: ArchitectureDocument): void {
    if (!locked) { editor = { ...editor, write: { ...editor.write, document: next } }; error = ''; saveFailed = false; }
  }
  function field(key: string, text: string): void { if (!locked) { editor = editField(editor, key, text); error = ''; saveFailed = false; } }
  function select(id: string | null): void { selected = id; }
  function add(type: ComponentType, at?: { x: number; y: number }): void {
    if (locked) return;
    const point = at ?? canvas.center();
    const existing = document.nodes.filter((n) => Math.abs(n.position.x - point.x) < 210 && Math.abs(n.position.y - point.y) < 135).length;
    const component = newComponent(type, at ? point : { x: point.x + existing * 26, y: point.y + existing * 30 });
    const count = document.nodes.filter((n) => n.type === type).length;
    if (count) component.label += ' ' + (count + 1);
    changeDocument({ ...clone(document), nodes: [...document.nodes, component] }); selected = component.id;
  }
  function positions(items: { id: string; x: number; y: number }[]): void {
    if (locked) return;
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
    if (locked) return;
    try { changeDocument(connect(document, source, target, undefined, oldId)); }
    catch (cause) { error = message(cause); }
  }
  function remove(nodes: string[], edges: string[]): void {
    if (locked) return;
    const next = removeElements(document, nodes, edges);
    const removed = [...nodes, ...document.edges.filter((e) => !next.edges.some((n) => n.id === e.id)).map((e) => e.id)];
    changeDocument(next); editor = clearElementDrafts(editor, removed); if (selected && removed.includes(selected)) selected = null;
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
        await refreshLibrary(); return true;
      } catch (cause) { error = message(cause); saveFailed = true; return false; }
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
    if (action.type === 'new') { editor = newEditor(); selected = null; error = ''; saveFailed = false; libraryOpen = false; }
    else {
      opening = true;
      try { const resource = await store.get(action.id); editor = openEditor(resource); selected = null; error = ''; saveFailed = false; libraryOpen = false; await tick(); await canvas.fit(); }
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
    } else editor = discardEditor(editor);
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
      if (editor.id === item.id) { editor = newEditor(); selected = null; saveFailed = false; }
      deleteTarget = null; await refreshLibrary();
    } catch (cause) { error = message(cause); }
    finally { deleting = false; }
  }
  function keydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); if (!locked && !navigation && !deleteTarget && !saveDisabled) void save();
    }
    if (event.key === 'Escape' && !navigation && !deleteTarget) libraryOpen = false;
  }
  function drag(event: DragEvent, type: ComponentType): void {
    event.dataTransfer?.setData('application/sysd-component', type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  const date = (value: string): string => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window onkeydown={keydown} />

<div class="studio">
  <header class="app-header">
    <div class="brand" aria-label="System Design Studio"><span class="brand-icon"><Network size={21} /></span><span>System Design<span class="brand-subtitle">STUDIO</span></span></div>
    <div class="header-divider"></div>
    <div class="architecture-title"><PencilLine size={14} /><input aria-label="Architecture name" value={fieldValue(editor, 'name', editor.write.name)} aria-invalid={!!editor.errors.name} oninput={(e) => field('name', e.currentTarget.value)} disabled={locked} autocomplete="off" /></div>
    <span class="save-state" class:changed={dirty || saveFailed} role="status">{#if saving}<LoaderCircle size={13} class="spin" />{:else if editor.id && !dirty && !saveFailed}<Check size={13} />{:else}<Circle size={7} fill="currentColor" />{/if}{status}</span>
    <nav class="header-actions" aria-label="Architecture actions"><button class="quiet" onclick={() => requestNavigation({ type: 'new' })} disabled={locked}><Plus size={16} />New</button><button class="quiet" class:active={libraryOpen} onclick={() => { libraryOpen = !libraryOpen; if (libraryOpen) void refreshLibrary(); }} disabled={locked}><FolderOpen size={16} />Library</button><button class="primary" aria-label={saveFailed ? "Retry Save" : "Save"} onclick={save} disabled={saveDisabled}><Save size={16} />{saveFailed ? 'Retry Save' : 'Save'}<kbd>⌘ S</kbd></button></nav>
  </header>

  <main class="workspace">
    <aside class="palette" aria-label="Component palette">
      <div class="panel-heading"><span class="eyebrow">BUILD YOUR SYSTEM</span><h2>Components</h2><p>Drag onto the canvas or click to add.</p></div>
      <div class="component-list">{#each catalog as item}<button class="palette-component" draggable={!locked} ondragstart={(event) => drag(event, item.type)} onclick={() => add(item.type)} disabled={locked} aria-label={'Add ' + item.name}><span class="component-icon" style:--component-color={item.color}><ComponentIcon type={item.type} /></span><span class="component-copy"><strong>{item.name}</strong><small>{item.description}</small></span><Plus size={14} class="add-mark" /></button>{/each}</div>
      <div class="palette-note"><Layers size={17} /><div><strong>Designed one step at a time</strong><p>Incomplete architectures can be saved. Connect and configure them whenever you’re ready.</p></div></div>
      <div class="palette-bottom"><span class="release-tag">RELEASE 1</span><span>Architecture editor</span></div>
    </aside>

    <div class="canvas-column">
      {#if error}<div class="error-banner" role="alert"><span>{error}</span>{#if saveFailed}<button onclick={save} disabled={saveDisabled}>Retry Save</button>{/if}<button aria-label="Dismiss error" onclick={() => error = ''}><X size={16} /></button></div>{/if}
      {#if Object.keys(editor.errors).length}<div class="validation-banner" role="alert">{#each Object.entries(editor.errors) as [key, issue]}<button onclick={() => { if (key !== 'name') selected = key.split(':')[1]; }}>{key === 'name' ? 'Architecture name' : document.nodes.find((n) => n.id === key.split(':')[1])?.label ?? 'Connection'}: {issue}</button>{/each}</div>{/if}
      <SvelteFlowProvider><Canvas bind:this={canvas} {document} {selected} {locked} onselect={select} onpositions={positions} onconnect={connection} onremove={remove} onadd={add} /></SvelteFlowProvider>
    </div>

    <aside class="inspector" aria-label="Configuration inspector">
      <div class="inspector-heading"><span><SlidersHorizontal size={17} />Inspector</span>{#if selected}<button class="icon-button" aria-label="Clear selection" onclick={() => selected = null}><X size={16} /></button>{/if}</div>
      <fieldset disabled={locked}>
      {#if node}
        <div class="inspector-content"><div class="selected-kind"><ComponentIcon type={node.type} /><span>{typeName(node.type)}</span></div><h2>{node.label}</h2><p class="inspector-intro">Configure this component.</p>
          <Field label="Label" value={fieldValue(editor, `node:${node.id}:label`, node.label)} error={editor.errors[`node:${node.id}:label`]} oninput={(text) => field(`node:${node.id}:label`, text)} />
          <div class="section-label">CONFIGURATION</div>
          {#if node.type === 'caller_group'}
            <Field label="Caller count" numeric value={fieldValue(editor, `node:${node.id}:caller_count`, node.caller_count)} error={editor.errors[`node:${node.id}:caller_count`]} oninput={(text) => field(`node:${node.id}:caller_count`, text)} />
            <Field label="Total test RPS" numeric value={fieldValue(editor, `node:${node.id}:test_rps`, node.test_rps)} error={editor.errors[`node:${node.id}:test_rps`]} oninput={(text) => field(`node:${node.id}:test_rps`, text)} hint="Total requests per second across the entire caller group." />
          {:else}<Field label="Maximum RPS" numeric value={fieldValue(editor, `node:${node.id}:capacity_rps`, node.capacity_rps)} error={editor.errors[`node:${node.id}:capacity_rps`]} oninput={(text) => field(`node:${node.id}:capacity_rps`, text)} />{/if}
          {#if node.type === 'load_balancer' || node.type === 'gateway'}<div class="form-field"><label for="routing">Routing policy</label><select id="routing" value={node.routing_policy} onchange={(e) => { const next = clone(document), n = next.nodes.find((n) => n.id === node.id); if (n && (n.type === 'load_balancer' || n.type === 'gateway')) { n.routing_policy = e.currentTarget.value === 'weighted' ? 'weighted' : 'round_robin'; changeDocument(next); } }}><option value="round_robin">Round-robin</option><option value="weighted">Weighted split</option></select></div>{/if}
          <div class="section-label">CANVAS POSITION</div><div class="coordinate-fields">{#each ['x', 'y'] as axis}<Field label={axis.toUpperCase() + ' position'} compact numeric value={fieldValue(editor, `node:${node.id}:${axis}`, axis === 'x' ? node.position.x : node.position.y)} error={editor.errors[`node:${node.id}:${axis}`]} oninput={(text) => field(`node:${node.id}:${axis}`, text)} />{/each}</div>
          <div class="section-label">{router ? 'DESTINATIONS' : 'CONNECTIONS'}<span>{outgoing.length}</span></div>
          {#if outgoing.length}{#each outgoing as destination, index}<div class="destination-row"><div class="destination-name"><button onclick={() => selected = destination.id}><ArrowUpRight size={14} />{document.nodes.find((n) => n.id === destination.target)?.label}</button>{#if router}<div class="order-buttons"><button aria-label={'Move up destination ' + (index + 1)} disabled={index === 0} onclick={() => changeDocument(reorder(document, destination.id, -1))}><ChevronUp size={13} /></button><button aria-label={'Move down destination ' + (index + 1)} disabled={index === outgoing.length - 1} onclick={() => changeDocument(reorder(document, destination.id, 1))}><ChevronDown size={13} /></button></div>{/if}</div>{#if (node.type === 'load_balancer' || node.type === 'gateway') && node.routing_policy === 'weighted'}<div class="weight-row"><Field label={'Weight for ' + (document.nodes.find((n) => n.id === destination.target)?.label ?? 'destination')} compact numeric value={fieldValue(editor, `edge:${destination.id}:weight`, destination.weight)} error={editor.errors[`edge:${destination.id}:weight`]} oninput={(text) => field(`edge:${destination.id}:weight`, text)} /><span>{weightPercent(document, destination)?.toFixed(1) ?? '—'}%</span></div>{/if}</div>{/each}{:else}<p class="muted">No outgoing connections yet.</p>{/if}
          {#if router && node && 'routing_policy' in node && node.routing_policy === 'weighted' && outgoing.length && outgoing.every((e) => e.weight === 0)}<p class="incomplete-hint">All weights are zero. You can save this draft and finish routing later.</p>{/if}
          {#if node.type !== 'database'}<div class="connection-controls"><label for="connect-target">Connect to</label><select id="connect-target" bind:value={connectionTarget}><option value="">Choose a component…</option>{#each document.nodes as target}<option value={target.id}>{target.label}</option>{/each}</select><button class="secondary" disabled={!connectionTarget} onclick={() => { if (node) connection(node.id, connectionTarget); }}>Connect<ArrowRight size={14} /></button></div>{/if}
          <button class="danger-text" onclick={() => { if (node) remove([node.id], []); }}><Trash2 size={14} />Remove component</button>
        </div>
      {:else if edge}
        <div class="inspector-content"><div class="selected-kind"><ArrowUpRight size={20} /><span>Directed connection</span></div><h2>Connection</h2><p class="inspector-intro">Change the path through your system.</p>
          <div class="form-field"><label for="redirect-source">Source</label><select id="redirect-source" bind:value={redirectSource}>{#each document.nodes as source}<option value={source.id}>{source.label}</option>{/each}</select></div>
          <div class="form-field"><label for="redirect-target">Target</label><select id="redirect-target" bind:value={redirectTarget}>{#each document.nodes as target}<option value={target.id}>{target.label}</option>{/each}</select></div>
          <button class="secondary full-width" onclick={() => { if (edge) connection(redirectSource, redirectTarget, edge.id); }}>Redirect connection<ArrowRight size={14} /></button>
          {#if document.nodes.some((n) => n.id === edge.source && (n.type === 'load_balancer' || n.type === 'gateway') && n.routing_policy === 'weighted')}<Field label="Relative weight" numeric value={fieldValue(editor, `edge:${edge.id}:weight`, edge.weight)} error={editor.errors[`edge:${edge.id}:weight`]} oninput={(text) => field(`edge:${edge.id}:weight`, text)} hint="Relative weights may be fractional or zero; they do not need to sum to 100." />{/if}
          <div class="connection-meta"><span>Destination order</span><strong>{edge.order}</strong></div><p class="field-hint">Adjust destination order from the source component’s inspector.</p>
          <button class="danger-text" onclick={() => { if (edge) remove([], [edge.id]); }}><Trash2 size={14} />Remove connection</button>
        </div>
      {:else}
        <div class="inspector-empty"><div class="inspector-illustration"><SlidersHorizontal size={28} strokeWidth={1.4} /></div><h3>A closer look.</h3><p>Select a component or connection<br />to edit its properties.</p></div>
        <div class="inspector-tip"><span class="eyebrow">GOOD TO KNOW</span><p>Keep your graph acyclic.<br />Each arrow defines a direction<br />for traffic to follow.</p></div>
      {/if}
      </fieldset>
    </aside>
  </main>

  <footer class="app-footer"><span><span class="local-dot"></span>Local workspace</span><span>{document.nodes.length} components<span class="footer-dot">·</span>{document.edges.length} connections</span><span>Saved in this browser<span class="footer-dot">·</span>Simulation coming later</span></footer>
</div>

{#if libraryOpen}
  <Modal title="Architecture library" oncancel={() => libraryOpen = false}>
    <p class="dialog-description">Browser-local placeholders. Saved architectures stay in this browser profile and frontend origin.</p>
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
    <p class="dialog-description">Delete “{deleteTarget.name}” from this browser’s saved library?{#if deleteTarget.id === editor.id} The active editor will be reset.{#if dirty} Its unsaved changes will also be discarded.{/if}{/if} This cannot be undone.</p>
    {#if error}<p class="dialog-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions"><button class="secondary" disabled={deleting} onclick={() => deleteTarget = null}>Cancel</button><button class="danger" disabled={deleting} onclick={confirmDelete}>{deleting ? 'Deleting…' : 'Delete architecture'}</button></div>
  </Modal>
{/if}
