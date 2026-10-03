<script lang="ts">
  import { Users, Network, Route, Server, Database } from '@lucide/svelte';
  import type { ComponentType } from '../lib/domain';
  let { type, size = 20 }: { type: ComponentType; size?: number } = $props();
  const icons = { caller_group: Users, load_balancer: Network, gateway: Route, server: Server, database: Database };
  const Icon = $derived(icons[type]);
</script>
<Icon {size} strokeWidth={1.7} />
