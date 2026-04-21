import type { ThreadOptions } from "../../types";

import { CodexThread } from "./thread";
import type { ThreadClient } from "./client";

export class Threads {
  constructor(private readonly client: ThreadClient) {}

  create(options: ThreadOptions = {}): CodexThread {
    return new CodexThread(this.client, options);
  }
}
