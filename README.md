# Hyperion Universalis MCP

A small, anonymous, read-only market-data adapter. Node 24; three direct dependencies: the official MCP SDK, Express and Zod. No database, API keys, FFXIV login, OpenAI API key or scheduled jobs. Hosting providers generally require their own account; that is separate from accessing Universalis. No deployment has been performed.

## Upload this project to GitHub

1. Create a repository named `hyperion-universalis-mcp`. Private is fine. Leave the automatic README, license and .gitignore options unchecked because the project already includes its documentation and ignore rules.
2. Extract the provided source ZIP on your computer. Upload the extracted files, not the ZIP itself, using GitHub's upload-files option.
3. Upload the **contents** at the repository root: `package.json`, `package-lock.json`, `server.mjs`, `market.mjs`, `README.md` and the remaining supplied files. Do not upload an enclosing folder. Include the dotfiles (`.gitignore` and `.dockerignore`); enable hidden-file display if your file picker hides them.
4. Commit the upload with the message `Initial Hyperion market-data MCP server`.
5. Confirm `package.json` and `render.yaml` appear immediately in the repository's main file list. Render's Root Directory can then be left blank when connecting this repository.

The source ZIP excludes dependencies, local Git metadata and generated live-test output. `npm ci --ignore-scripts` restores dependencies using the included lockfile. No hosting or deployment happens merely by uploading these files to GitHub.

See [GitHub's file-upload instructions](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

## Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `get_prices` | `item_ids`: 1–10 unique positive integer IDs | Batch asking-price summaries, NQ/HQ minima and upload times |
| `get_listings` | `item_id`, `limit`: 1–50 (20), `quality`: all/nq/hq (all) | Bounded individual listings, quantities and unit prices |
| `get_recent_sales` | `item_id`, `days`: 1–30 (7), `limit`: 1–1000 (500) | Completed sales, observed units/day, transactions/day and quantity-weighted sale price |

Numbers in parentheses are defaults. All tools are fixed to Hyperion (world ID 95); no arbitrary URLs, worlds, uploads, trading or account actions are exposed. Item IDs must be obtained separately: this intentionally does not add an item-search dependency or claim to discover profitable items across the entire game.

## Run and verify locally

Install Node.js 24 LTS, including npm. From this folder:

```powershell
npm ci --ignore-scripts
npm test
npm run smoke
npm start
```

`npm test` runs deterministic checks, including a real local MCP client/server handshake, strict schemas, unsafe inputs, host/origin rejection, body limits, upstream error handling, caching, rate limiting and velocity arithmetic. `npm run smoke` starts an ephemeral local server and calls all three tools through the official MCP HTTP client against **live Universalis data**. It writes `smoke-result.json`; it fails if endpoints fail, rather than silently substituting fixtures. `npm start` listens on port 3000 (or `PORT`). `/health` reports process health without querying Universalis. Localhost is only for local tests, not a ChatGPT server URL.

To rerun the same MCP smoke test against an approved deployment:

```powershell
$env:MCP_URL = 'https://YOUR-SERVICE.onrender.com/mcp'
npm run smoke
Remove-Item Env:MCP_URL
```

## Proposed remote deployment: Render free web service

**Approval boundary:** these are preparation instructions. Do not create the hosted service, publish a repository or enable a paid plan without Tavi's approval. No service has been created and no host has been selected on Tavi's behalf. Review the actual plan, limits and billing screen before proceeding.

After approval:

1. Put this folder's source files and `package-lock.json` in a Git repository you authorize for deployment. Exclude `node_modules`, `.env` and test output. Render can connect to a private repository; publishing it publicly is unnecessary.
2. In Render choose **New → Web Service**, connect that repository, select **Node**, and choose **Free** explicitly. If the repository contains this folder below its root, set Render's Root Directory to the folder containing `package.json`.
3. Build command: `npm ci --ignore-scripts`. Start command: `npm start`. Health check: `/health`. Set `NODE_VERSION=24.22.3`.
4. Set `PUBLIC_URL` to the service's exact HTTPS origin, e.g. `https://YOUR-SERVICE.onrender.com` (no `/mcp`). This is required for public Host validation. Render's service name determines its generated URL; copy the exact assigned hostname from its dashboard. If the first launch happens before this variable is set, public requests will return 403; set it and restart before testing.
5. Deploy only after confirming the selected plan is approved. There are no disks, databases, secrets or paid extras to add. `render.yaml` contains equivalent settings if you prefer a Blueprint; `PUBLIC_URL` must still be supplied.
6. Open `https://YOUR-SERVICE.onrender.com/health`, then run the remote smoke test above. The host proxy must preserve the original Host header. With a custom domain, update `PUBLIC_URL` to that origin.
7. Connect ChatGPT using the instructions below and perform the acceptance prompts. Local MCP tests do not establish that your ChatGPT account can connect.

Render's free web services sleep after 15 idle minutes and cold starts can interfere with ChatGPT discovery/tool timeouts. Open `/health` and wait for it to return JSON before connecting or retrying ChatGPT. A free instance is a trial option, not a promise of always-on availability. Any later paid upgrade requires separate approval. See [Render free-service limits](https://render.com/docs/free) and [Node deployment guide](https://render.com/docs/deploy-node-express-app). A Dockerfile is also provided for an existing approved container host; that route was not tested here.

## Connect to ChatGPT

Verified against official documentation on 2026-11-21:

1. Open ChatGPT **Plugins**, select **+ → Add custom MCP server**.
2. Name it `Hyperion Market Data`, enter the public **`https://YOUR-SERVICE.onrender.com/mcp`** URL under Connection.
3. Choose **No authentication**. This server exposes only public data; do not enter FFXIV credentials or API keys.
4. Review ChatGPT's warning, then choose **Create as a plugin**.
5. Inspect the discovered tools: only `get_prices`, `get_listings`, `get_recent_sales` should appear. Enable the plugin in a chat and run the prompts below.

The current official custom-server guide lists SSE and streaming HTTP; this project uses **stateless Streamable HTTP with JSON responses**, implemented by the official MCP SDK. It deliberately returns 405 for GET/DELETE `/mcp`: it has no persistent server event stream or sessions. A browser visit to `/mcp` is not a connection test. No legacy SSE endpoint is included. Current instructions do not require the older Developer Mode setup; actual availability remains subject to account/workspace permissions. No `search`/`fetch` tools are needed for these ordinary market tools; this is not a deep-research connector.

Sources: [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server), [connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [anonymous authentication](https://developers.openai.com/plugins/build/auth), [SDK transport documentation](https://ts.sdk.modelcontextprotocol.io/server).

Acceptance prompts:

- “Use Hyperion Market Data to get prices for item IDs 2 and 3. Show upload times and distinguish asking prices from completed sales.”
- “Get the first 3 listings for item 2 on Hyperion.”
- “Get recent sales for item 2 over 7 days, capped at 100 entries. Report units/day, transactions/day and whether the cap may truncate the sample.”
- “Get prices for item ID -1.” This should be rejected; no upstream call should be needed.

If discovery fails, first warm `/health`; verify the exact `/mcp` suffix, `PUBLIC_URL`, host logs and workspace permissions, then run the remote smoke test. A 403 indicates host/origin configuration; 429 means wait 60 seconds; 405 on a browser GET is expected. The SDK client smoke test is more meaningful than an HTTP ping. Actual ChatGPT discovery and invocation remain unverified until deployment is approved and performed.

## Data interpretation

The [Universalis API reference](https://docs.universalis.app/) documents current data at `/api/v2/{world}/{items}` and history at `/api/v2/history/{world}/{items}`. This adapter uses `listings`/`entries` limits, HQ filtering, history `entriesToReturn`, `entriesWithin` in **seconds**, and `statsWithin` in **milliseconds**. The live test uses world Hyperion and item IDs 2 and 3 without credentials. Upstream URLs and retrieval timestamps accompany every result.

Observed velocity is explicitly `sum(returned in-window quantities) / requested days`; transaction velocity is `returned in-window transactions / requested days`. Quantity-weighted price is `sum(pricePerUnit * quantity) / sum(quantity)` and null for an empty sample. These are measurements of returned crowdsourced records, not demand forecasts or guaranteed profit. A full cap warns of possible truncation; fewer entries does not prove upload completeness. The upstream `regularSaleVelocity`, `nqSaleVelocity` and `hqSaleVelocity` fields are returned separately without assuming an equivalent definition. NQ and HQ are mixed in sales summaries; individual sales retain their quality flags. Split them before comparing quality-specific markets.

`lastUploadTimeMs` is Unix milliseconds; listing review and sale timestamps are Unix seconds. Retrieval time is not freshness. Current listings and history are separate API calls and are not an atomic snapshot. Asking prices, sample quantities and completed-sale prices are distinct. Universalis may use zero for unavailable prices; do not read it as a free item. Listing totals are stack prices; market taxes, crafting inputs, gardening times and opportunity costs are not deducted. No profitability ranking is provided by this minimal connector.

## Safety and operational limits

- Fixed public upstream origin and world; strict integer schemas and unknown-field rejection. No credentials, user-controlled URLs, redirects, file access or write tools.
- Seller/buyer identities are not returned or logged. The hosting platform can still log request metadata; do not send personal data as tool arguments.
- 10-second upstream deadline; 2 MB decompressed response cap; no automatic retries. A failure is an error, never fabricated empty market data.
- 60-second cache, at most 100 keys; 20 upstream starts/minute, 2 concurrent upstream requests. MCP allows 60 HTTP requests/minute globally and 8 concurrent requests, with 16 KB JSON bodies. Limits are per process, reset on restart, and deliberately global to avoid trusting proxy IP headers. Keep one service instance; distributed protection would need host-level limits/shared state.
- Exact Host allowlist from `PUBLIC_URL` plus local hosts; present browser Origin must match `PUBLIC_URL`. Absent Origin is accepted for server clients. CORS is not enabled. Host/origin checks are DNS-rebinding defenses, **not authentication**: anyone knowing the public endpoint can consume its bounded quota. For a personal low-volume trial this may be acceptable; sustained public hosting needs provider abuse controls or OAuth.
- Dependencies are pinned with a lockfile. Review updates and rerun tests before changing them. The official SDK handles MCP protocol negotiation/validation instead of maintaining a custom protocol implementation.

No claim is made that deployment, provider reliability, or ChatGPT account compatibility has been verified by local tests.

