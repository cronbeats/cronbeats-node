import { ApiError } from "./errors.js";

export type HttpResponse = {
  status: number;
  body: string;
  headers: Record<string, string>;
};

export interface HttpClient {
  request(args: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }): Promise<HttpResponse>;
}

export class FetchHttpClient implements HttpClient {
  async request(args: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 5000);

    try {
      const res = await fetch(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.body,
        signal: controller.signal,
      });
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: res.status, body: text, headers };
    } catch (err) {
      throw new ApiError({
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error",
        retryable: true,
        raw: err,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
