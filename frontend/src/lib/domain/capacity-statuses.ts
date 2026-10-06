/** Capacity states are separate from component roles and request drops. */
export const CapacityStatus = Object.freeze({
  NORMAL: 'normal',
  NEAR: 'near',
  FULL: 'full',
} as const);

export type CapacityStatus = typeof CapacityStatus[keyof typeof CapacityStatus];
