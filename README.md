# CronBeats Node SDK (Ping)

[![npm version](https://img.shields.io/npm/v/@cronbeats/cronbeats-node)](https://www.npmjs.com/package/@cronbeats/cronbeats-node)
[![downloads](https://img.shields.io/npm/dt/@cronbeats/cronbeats-node)](https://www.npmjs.com/package/@cronbeats/cronbeats-node)

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

## Progress Tracking

Track your job's progress in real-time. CronBeats supports two distinct modes:

### Mode 1: With Percentage (0-100)
Shows a **progress bar** and your status message on the dashboard.

✓ **Use when**: You can calculate meaningful progress (e.g., processed 750 of 1000 records)

```ts
// Percentage mode: 0-100 with message
await client.progress(50, "Processing batch 500/1000");

// Or using options object
await client.progress({
  seq: 75,
  message: "Almost done - 750/1000",
});
```

### Mode 2: Message Only
Shows **only your status message** (no percentage bar) on the dashboard.

✓ **Use when**: Progress isn't measurable or you only want to send status updates

```ts
// Message-only mode: null seq, just status updates
await client.progress(null, "Connecting to database...");
await client.progress(null, "Starting data sync...");
```

### What you see on the dashboard
- **Mode 1**: Progress bar (0-100%) + your message → "75% - Processing batch 750/1000"
- **Mode 2**: Only your status message → "Connecting to database..."

### Complete Example

```ts
import { PingClient } from "@cronbeats/cronbeats-node";

const client = new PingClient("abc123de");
await client.start();

try {
  // Message-only updates for non-measurable steps
  await client.progress(null, "Connecting to database...");
  const db = await connectToDatabase();
  
  await client.progress(null, "Fetching records...");
  const total = await db.count();
  
  // Percentage updates for measurable progress
  for (let i = 0; i < total; i++) {
    await processRecord(i);
    
    if (i % 100 === 0) {
      const percent = Math.floor((i * 100) / total);
      await client.progress(percent, `Processed ${i} / ${total} records`);
    }
  }
  
  await client.progress(100, "All records processed");
  await client.success();
  
} catch (err) {
  await client.fail();
  throw err;
}
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
