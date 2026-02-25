import { ApiError, ApiErrorCode, ValidationError } from "./errors.js";
import { FetchHttpClient, HttpClient } from "./http.js";

export type PingClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  retryJitterMs?: number;
  userAgent?: string;
  httpClient?: HttpClient;
};

export type ProgressOptions = {
  seq?: number;
  message?: string;
};

export type PingSuccess = {
  ok: true;
  action: string;
  jobKey: string;
  timestamp: string;
  processingTimeMs: number;
  nextExpected: string | null;
  raw: Record<string, unknown>;
};

export class PingClient {
  private readonly baseUrl: string;
  private readonly jobKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly retryJitterMs: number;
  private readonly userAgent: string;
  private readonly httpClient: HttpClient;

  constructor(jobKey: string, options: PingClientOptions = {}) {
    this.assertJobKey(jobKey);
    this.jobKey = jobKey;
    this.baseUrl = (options.baseUrl ?? "https://cronbeats.io").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBackoffMs = options.retryBackoffMs ?? 250;
    this.retryJitterMs = options.retryJitterMs ?? 100;
    this.userAgent = options.userAgent ?? "cronbeats-node-sdk/0.1.0";
    this.httpClient = options.httpClient ?? new FetchHttpClient();
  }

  ping(): Promise<PingSuccess> {
    return this.request("ping", `/ping/${this.jobKey}`);
  }

  start(): Promise<PingSuccess> {
    return this.request("start", `/ping/${this.jobKey}/start`);
  }

  end(status: "success" | "fail" = "success"): Promise<PingSuccess> {
    if (status !== "success" && status !== "fail") {
      throw new ValidationError('Status must be "success" or "fail".');
    }
    return this.request("end", `/ping/${this.jobKey}/end/${status}`);
  }

  success(): Promise<PingSuccess> {
    return this.end("success");
  }

  fail(): Promise<PingSuccess> {
    return this.end("fail");
  }

  progress(seqOrOptions: number | ProgressOptions | null = null, message?: string): Promise<PingSuccess> {
    let seq: number | null = null;
    let msg = message ?? "";

    if (typeof seqOrOptions === "number") {
      seq = seqOrOptions;
    } else if (seqOrOptions && typeof seqOrOptions === "object") {
      seq = typeof seqOrOptions.seq === "number" ? seqOrOptions.seq : null;
      msg = seqOrOptions.message ?? msg;
    }

    if (seq !== null && (!Number.isInteger(seq) || seq < 0)) {
      throw new ValidationError("Progress seq must be a non-negative integer.");
    }

    const safeMsg = (msg ?? "").slice(0, 255);

    if (seq !== null) {
      return this.request("progress", `/ping/${this.jobKey}/progress/${seq}`, {
        message: safeMsg,
      });
    }

    return this.request("progress", `/ping/${this.jobKey}/progress`, {
      message: safeMsg,
    });
  }

  private async request(
    action: string,
    path: string,
    body: Record<string, unknown> = {}
  ): Promise<PingSuccess> {
    const url = `${this.baseUrl}${path}`;
    const payload = Object.keys(body).length === 0 ? undefined : JSON.stringify(body);

    let attempt = 0;
    while (true) {
      try {
        const res = await this.httpClient.request({
          method: "POST",
          url,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "user-agent": this.userAgent,
          },
          body: payload,
          timeoutMs: this.timeoutMs,
        });

        const parsed = this.safeParseJson(res.body);

        if (res.status >= 200 && res.status < 300) {
          return this.normalizeSuccess(action, parsed);
        }

        const mapped = this.mapError(res.status);
        const msg = typeof parsed.message === "string" ? parsed.message : "Request failed";

        if (mapped.retryable && attempt < this.maxRetries) {
          attempt++;
          await this.sleepWithBackoff(attempt);
          continue;
        }

        throw new ApiError({
          code: mapped.code,
          httpStatus: res.status,
          retryable: mapped.retryable,
          message: msg,
          raw: parsed,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code !== "NETWORK_ERROR") {
          throw err;
        }

        if (attempt >= this.maxRetries) {
          if (err instanceof ApiError) {
            throw err;
          }
          throw new ApiError({
            code: "NETWORK_ERROR",
            retryable: true,
            message: err instanceof Error ? err.message : "Network error",
            raw: err,
          });
        }

        attempt++;
        await this.sleepWithBackoff(attempt);
      }
    }
  }

  private normalizeSuccess(action: string, payload: Record<string, unknown>): PingSuccess {
    return {
      ok: true,
      action: typeof payload.action === "string" ? payload.action : action,
      jobKey: typeof payload.job_key === "string" ? payload.job_key : this.jobKey,
      timestamp: typeof payload.timestamp === "string" ? payload.timestamp : "",
      processingTimeMs:
        typeof payload.processing_time_ms === "number"
          ? payload.processing_time_ms
          : Number(payload.processing_time_ms ?? 0),
      nextExpected: typeof payload.next_expected === "string" ? payload.next_expected : null,
      raw: payload,
    };
  }

  private mapError(status: number): { code: ApiErrorCode; retryable: boolean } {
    if (status === 400) return { code: "VALIDATION_ERROR", retryable: false };
    if (status === 404) return { code: "NOT_FOUND", retryable: false };
    if (status === 429) return { code: "RATE_LIMITED", retryable: true };
    if (status >= 500) return { code: "SERVER_ERROR", retryable: true };
    return { code: "UNKNOWN_ERROR", retryable: false };
  }

  private assertJobKey(jobKey: string): void {
    if (!/^[a-zA-Z0-9]{8}$/.test(jobKey)) {
      throw new ValidationError("jobKey must be exactly 8 Base62 characters.");
    }
  }

  private safeParseJson(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return { message: "Invalid JSON response" };
    }
  }

  private sleepWithBackoff(attempt: number): Promise<void> {
    const base = this.retryBackoffMs * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * Math.max(1, this.retryJitterMs + 1));
    const waitMs = base + jitter;
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
