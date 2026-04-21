import { describe, expect, it } from "vitest";

import { MockResponsesTransport } from "@pandelis/codex-web-sdk";
import type { ResponsesRequest } from "@pandelis/codex-web-sdk";

import { generateToolCodeFromDescription, generateToolSchemaFromDescription } from "./toolDrafts";
import { loadTestWasmModule } from "../../../../packages/codex-web-sdk/test/loadWasm";

async function* createStream(text: string, responseId = "resp_demo_tool") {
  yield {
    type: "response.output_item.added",
    item: {
      id: "msg_1",
      type: "message",
      content: []
    }
  };
  yield {
    type: "response.output_text.delta",
    item_id: "msg_1",
    delta: text
  };
  yield {
    type: "response.output_item.done",
    item: {
      id: "msg_1",
      type: "message",
      content: [
        {
          type: "output_text",
          text
        }
      ]
    }
  };
  yield {
    type: "response.completed",
    response: {
      id: responseId,
      usage: {
        input_tokens: 1,
        output_tokens: 1
      }
    }
  };
}

describe("tool generation helpers", () => {
  it("uses the provided chat model for schema generation and parses fenced JSON", async () => {
    const wasmURL = await loadTestWasmModule();
    const requests: ResponsesRequest[] = [];
    const transport = new MockResponsesTransport((request) => {
      requests.push(structuredClone(request));
      return createStream("```json\n{\n  \"type\": \"object\",\n  \"properties\": {\n    \"city\": { \"type\": \"string\" }\n  },\n  \"required\": [\"city\"]\n}\n```");
    });

    const schema = await generateToolSchemaFromDescription({
      description: "city string is required",
      toolName: "lookup_weather",
      options: {
        defaultModel: "gpt-5.4",
        transport
      },
      wasmURL
    });

    expect(JSON.parse(schema)).toEqual({
      type: "object",
      properties: {
        city: {
          type: "string"
        }
      },
      required: ["city"]
    });
    expect(requests[0]?.body.model).toBe("gpt-5.4");
  });

  it("uses the provided chat model for code generation and parses fenced JavaScript", async () => {
    const wasmURL = await loadTestWasmModule();
    const requests: ResponsesRequest[] = [];
    const transport = new MockResponsesTransport((request) => {
      requests.push(structuredClone(request));
      return createStream("```javascript\nconst city = input.city ?? \"Limassol\";\nreturn { city };\n```", "resp_demo_code");
    });

    const code = await generateToolCodeFromDescription({
      name: "lookup_weather",
      codeDescription: "return the requested city",
      options: {
        defaultModel: "gpt-5.4",
        transport
      },
      wasmURL
    });

    expect(code).toContain("const city = input.city");
    expect(code).toContain("return { city };");
    expect(requests[0]?.body.model).toBe("gpt-5.4");
  });
});
