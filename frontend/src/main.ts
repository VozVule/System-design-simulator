import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import type { ArchitectureStore } from './lib/storage';
const target = document.getElementById('app');
if (!target) throw new Error('Application mount element is missing.');
async function start(element: HTMLElement): Promise<void> {
  let store: ArchitectureStore | undefined;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('test-store')) {
    const { controlledStore } = await import('./test-store'); store = controlledStore();
  }
  mount(App, { target: element, props: { store } });
}
void start(target);
