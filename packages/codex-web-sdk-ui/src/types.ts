import type { McpServerDescriptor, RawResponsesStreamEvent, ThreadEvent } from "@pandelis/codex-web-sdk";
import type { UseCodexChatResult } from "@pandelis/codex-web-sdk-react";

export type ChatRootProps = {
  chat: UseCodexChatResult;
  children: React.ReactNode;
  className?: string;
};

export type ToolEditorValue = {
  id: string;
  name: string;
  description?: string;
  runtime?: "browser-js";
  schemaDescription?: string;
  inputSchema?: string;
  code?: string;
  output?: string;
};

export type ToolEditorProps = {
  value: ToolEditorValue[];
  onChange: (value: ToolEditorValue[]) => void;
  className?: string;
};

export type McpServerListProps = {
  value: McpServerDescriptor[];
  onChange: (value: McpServerDescriptor[]) => void;
  statuses?: Array<{
    serverId: string;
    available: boolean;
    reason?: string;
    nodeOnly: boolean;
    toolCount?: number;
  }>;
  className?: string;
};

export type EventInspectorProps = {
  events?: ThreadEvent[];
  rawEvents?: RawResponsesStreamEvent[];
  className?: string;
};
