import type { ChickadeeApi } from './index';

declare global {
  interface Window {
    chickadee: ChickadeeApi;
  }
}

export {};
