import { normalizeCodexOptions } from "./core/config";
import type { CodexOptions } from "./types";
import { ThreadClient } from "./resources/threads/client";
import { Threads } from "./resources/threads/resource";

export default class Codex {
  readonly threads: Threads;
  private readonly client: ThreadClient;

  constructor(options: CodexOptions = {}) {
    this.client = new ThreadClient(normalizeCodexOptions(options));
    this.threads = new Threads(this.client);
  }
}
