export {};
declare global {
  interface Window {
    candyDesktop?: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
      toggleFullscreen(): void;
    };
  }
}
