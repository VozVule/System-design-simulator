/** Display-only phase shared with custom edges; recorded frames stay unchanged. */
export const REPLAY_VIEW = Symbol('replay-view');
export interface ReplayView {
  readonly step: number;
  readonly total: number;
  readonly progress: number;
  readonly playing: boolean;
}
