/**
 * Types for the AudioWorkletGlobalScope, which TypeScript's DOM library does not
 * describe. Imported only by the processor modules, so `sampleRate` and friends
 * never leak into main-thread code as fake globals.
 */
export interface ProcessorBase {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

interface WorkletScope {
  sampleRate: number;
  currentTime: number;
  AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
  registerProcessor(name: string, ctor: new () => ProcessorBase): void;
}

export const scope = globalThis as unknown as WorkletScope;
