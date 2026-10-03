/** Optional desktop navigation input. Angles are clockwise increments; cursor coordinates are viewport CSS pixels. */
export interface NavigationHost {
  onRotate(callback: (degrees: number, pointer: { x: number; y: number }) => void): () => void;
}
declare global {
  interface Window {
    makeshiftNavigation?: NavigationHost;
  }
}
