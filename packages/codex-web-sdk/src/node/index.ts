import { createNodeRuntimeAdapter as createRuntimeAdapter } from "../runtime/adapters";
import { NodeStdioMcpAdapter } from "./stdioMcpAdapter";

export { NodeStdioMcpAdapter };

export function createNodeRuntimeAdapter() {
  return createRuntimeAdapter([new NodeStdioMcpAdapter()]);
}
