/** Component roles keep the version 1 API values. */
export const ComponentType = Object.freeze({
  CALLER_GROUP: 'caller_group',
  LOAD_BALANCER: 'load_balancer',
  GATEWAY: 'gateway',
  SERVER: 'server',
  DATABASE: 'database',
} as const);

export type ComponentType = typeof ComponentType[keyof typeof ComponentType];
const routerComponentTypes = [ComponentType.LOAD_BALANCER, ComponentType.GATEWAY] as const;
export type RouterComponentType = typeof routerComponentTypes[number];

export const ROUTER_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set(routerComponentTypes);
export const SINGLE_DESTINATION_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set([ComponentType.CALLER_GROUP, ComponentType.SERVER]);
const componentTypes: ReadonlySet<string> = new Set(Object.values(ComponentType));

export function isComponentType(value: unknown): value is ComponentType {
  return typeof value === 'string' && componentTypes.has(value);
}
