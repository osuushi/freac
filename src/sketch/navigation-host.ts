/** Optional desktop navigation input. Angles are incremental, clockwise degrees. */
export interface NavigationHost {
  onRotate(callback: (degrees: number) => void): () => void;
}
declare global {
  interface Window {
    makeshiftNavigation?: NavigationHost;
  }
}
