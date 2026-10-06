/** Request routing policies keep the version 1 API values. */
export const RoutingPolicy = Object.freeze({
  ROUND_ROBIN: 'round_robin',
  WEIGHTED: 'weighted',
} as const);

export type RoutingPolicy = typeof RoutingPolicy[keyof typeof RoutingPolicy];
