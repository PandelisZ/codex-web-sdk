/* tslint:disable */
/* eslint-disable */

export class WasmCodexRuntime {
    free(): void;
    [Symbol.dispose](): void;
    complete_response(thread_id: string): any;
    ingest_stream_event(thread_id: string, event: any): any;
    constructor(config: any);
    start_turn(args: any): any;
    submit_tool_outputs(thread_id: string, outputs: any): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmcodexruntime_free: (a: number, b: number) => void;
    readonly wasmcodexruntime_complete_response: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmcodexruntime_ingest_stream_event: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly wasmcodexruntime_new: (a: any) => [number, number, number];
    readonly wasmcodexruntime_start_turn: (a: number, b: any) => [number, number, number];
    readonly wasmcodexruntime_submit_tool_outputs: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
