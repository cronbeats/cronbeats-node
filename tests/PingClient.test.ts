import { describe, expect, it } from "vitest";
import { ApiError, PingClient, ValidationError } from "../src/index.js";
import type { HttpClient } from "../src/http.js";

class StubHttpClient implements HttpClient {
  private idx = 0;
  public calls: Array<{ method: string; url: string; body?: string }> = [];
  constructor(
    private readonly responses: Array<{
      status: number;
      body: string;
      headers?: Record<string, string>;
    }>
  ) {}

  async request(args: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }) {
    this.calls.push({ method: args.method, url: args.url, body: args.body });
    const r = this.responses[Math.min(this.idx, this.responses.length - 1)];
    this.idx++;
    return { status: r.status, body: r.body, headers: r.headers ?? {} };
  }
}

describe("PingClient", () => {
  it("rejects invalid job key", () => {
    expect(() => new PingClient("invalid-key")).toThrow(ValidationError);
  });

  it("normalizes success response", async () => {
    const http = new StubHttpClient([
      {
        status: 200,
        body: JSON.stringify({
          status: "success",
          message: "OK",
          action: "ping",
          job_key: "abc123de",
          timestamp: "2026-02-25 12:00:00",
          processing_time_ms: 8.25,
        }),
      },
    ]);
    const client = new PingClient("abc123de", { httpClient: http });
    const res = await client.ping();
    expect(res.ok).toBe(true);
    expect(res.action).toBe("ping");
    expect(res.jobKey).toBe("abc123de");
    expect(res.processingTimeMs).toBe(8.25);
  });

  it("maps 404 to NOT_FOUND", async () => {
    const http = new StubHttpClient([
      { status: 404, body: JSON.stringify({ status: "error", message: "Job not found or disabled" }) },
    ]);
    const client = new PingClient("abc123de", { httpClient: http, maxRetries: 0 });
    await expect(client.ping()).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      code: "NOT_FOUND",
      retryable: false,
      httpStatus: 404,
    });
  });

  it("retries on 429 then succeeds", async () => {
    const http = new StubHttpClient([
      { status: 429, body: JSON.stringify({ status: "error", message: "Too many requests" }) },
      {
        status: 200,
        body: JSON.stringify({
          status: "success",
          message: "OK",
          action: "ping",
          job_key: "abc123de",
          timestamp: "2026-02-25 12:00:00",
          processing_time_ms: 7.1,
        }),
      },
    ]);
    const client = new PingClient("abc123de", {
      httpClient: http,
      maxRetries: 2,
      retryBackoffMs: 1,
      retryJitterMs: 0,
    });
    const res = await client.ping();
    expect(res.ok).toBe(true);
    expect(http.calls.length).toBe(2);
  });

  it("does not retry on 400", async () => {
    const http = new StubHttpClient([
      { status: 400, body: JSON.stringify({ status: "error", message: "Invalid request" }) },
    ]);
    const client = new PingClient("abc123de", { httpClient: http, maxRetries: 2 });
    await expect(client.ping()).rejects.toMatchObject<ApiError>({
      code: "VALIDATION_ERROR",
      retryable: false,
    });
    expect(http.calls.length).toBe(1);
  });

  it("normalizes progress and truncates long message", async () => {
    const http = new StubHttpClient([
      {
        status: 200,
        body: JSON.stringify({
          status: "success",
          message: "OK",
          action: "progress",
          job_key: "abc123de",
          timestamp: "2026-02-25 12:00:00",
          processing_time_ms: 8,
        }),
      },
    ]);
    const longMsg = "x".repeat(300);
    const client = new PingClient("abc123de", { httpClient: http });
    await client.progress({ seq: 50, message: longMsg });
    expect(http.calls[0]?.url.endsWith("/ping/abc123de/progress/50")).toBe(true);
    const parsed = JSON.parse(http.calls[0]?.body ?? "{}");
    expect(parsed.message.length).toBe(255);
  });
});
