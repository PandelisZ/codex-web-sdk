import type { JsonValue } from "../types";

let rpcId = 0;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: JsonValue;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number;
  result?: JsonValue;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: JsonValue;
  };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export function createRpcRequest(method: string, params?: JsonValue): JsonRpcRequest {
  rpcId += 1;
  return {
    jsonrpc: "2.0",
    id: rpcId,
    method,
    params
  };
}

export function assertRpcSuccess(response: JsonRpcResponse): JsonRpcSuccess {
  if ("error" in response) {
    throw new Error(response.error.message);
  }

  return response;
}

export function toMcpInitializeParams() {
  return {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "@pandelis/codex-web-sdk",
      version: "0.1.0"
    }
  } satisfies JsonValue;
}
