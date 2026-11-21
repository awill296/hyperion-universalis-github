# Verification — 2026-11-21

Status: implementation and local/live tests complete. No hosted service or public repository created; no deployment costs incurred. ChatGPT's actual tool discovery and calls remain pending an approved deployment.

- Official SDK client successfully initialized the local stateless Streamable HTTP server and discovered exactly three annotated read-only tools.
- All three deterministic test groups passed: velocity arithmetic/window handling; upstream failure, size limit, timeout propagation and caching; MCP schemas and HTTP safeguards (including host/origin, request body and global request-rate limits).
- All three live MCP tool calls passed against the real public Universalis API: batch prices for IDs 2 and 3, three listings for ID 2, and a seven-day sales-history query for ID 2 capped at 100 records.
- The live history response used `regularSaleVelocity`, `nqSaleVelocity` and `hqSaleVelocity`; the implementation preserves those names separately from its own observed velocity calculation.
- Malformed item ID rejected through the MCP client.
- Dependency installation reported zero known vulnerabilities at installation time. Lockfile included. This is not a security audit.
- Full live output was saved locally in `smoke-result.json` during verification. It is intentionally excluded from this repository package; rerun `npm run smoke` to generate a fresh report with upstream URLs. Prices must be refreshed for decisions.

Current documentation reviewed: [OpenAI custom MCP configuration](https://developers.openai.com/api/docs/guides/custom-mcp-server), [OpenAI connection testing](https://developers.openai.com/plugins/deploy/connect-chatgpt), [MCP SDK server transports](https://ts.sdk.modelcontextprotocol.io/server), [Universalis API](https://docs.universalis.app/), [Render free-service limitations](https://render.com/docs/free).

Not tested: hosted proxy behavior, provider deployment, Docker build, real ChatGPT account permissions/connection, multi-instance rate limiting or sustained public abuse. See README for the deployment and final acceptance procedure.
