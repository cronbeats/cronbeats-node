# CronBeats Node SDK (Ping)

Official Node.js SDK for CronBeats ping telemetry.

## Install (local/dev)

```bash
npm install
```

## SDK API

- `ping()`
- `start()`
- `end("success" | "fail")`
- `success()`
- `fail()`
- `progress(seqOrOptions, message?)`

## Quick Usage

```ts
import { PingClient } from "./dist/index.js";

const client = new PingClient("abc123de", {
  baseUrl: "https://cronbeats.io",
  timeoutMs: 5000,
  maxRetries: 2,
});

await client.start();
// ...your work...
await client.success();
```

## Progress Examples

```ts
await client.progress(50, "Processing batch 50/100");

await client.progress({
  seq: 75,
  message: "Almost done",
});
```

## Error Handling

```ts
import { ApiError, ValidationError } from "./dist/index.js";

try {
  await client.ping();
} catch (err) {
  if (err instanceof ValidationError) {
    // Invalid local inputs
  } else if (err instanceof ApiError) {
    // API/network issue
    console.log(err.code, err.httpStatus, err.retryable);
  }
}
```

## Notes

- Uses `POST` for telemetry requests.
- `jobKey` must be exactly 8 Base62 characters.
- Retries only for network errors, HTTP `429`, and HTTP `5xx`.
- Default timeout is 5s to avoid blocking cron jobs.
