# Repairing a failed Render health check

The original server required manual PUBLIC_URL configuration before accepting requests bearing the Render hostname. The updated server automatically reads Render's RENDER_EXTERNAL_URL instead, while retaining exact host checks. This fixes a locally reproduced rejection of Render-style health probes; deployment logs are still needed to confirm the cause of any particular failed deployment.

1. Replace server.mjs in the GitHub repository with the updated file, then commit. Other runtime files and dependencies are unchanged. Updated tests and deployment documentation are included in the full source package.
2. In Render, ensure the Health Check Path is `/health`, not `/` or `/mcp`. `/mcp` deliberately rejects browser GET requests with HTTP 405; it cannot be the health check.
3. Ensure Start Command is `npm start` and Root Directory is blank if package.json is at the repository root.
4. PUBLIC_URL can be removed when using only the default Render address. If retaining it, it must be the correct HTTPS origin without `/mcp`. Invalid values cause startup to fail. RENDER_EXTERNAL_URL is supplied by Render; do not manually override it.
5. Let the configured auto-deploy run, or use Render's manual deployment control if auto-deploy is disabled. Keep the existing Free compute plan.
6. Confirm logs show `Hyperion MCP listening on 0.0.0.0:<port>; health check: /health` and that the deployment becomes healthy. Open the service URL with `/health`: expect `{"status":"ok"}`.
7. Only then retry ChatGPT with the service URL ending in `/mcp` and No authentication.

If the deploy still fails, inspect the last 15–20 lines of the deployment log. The listening message distinguishes an application that started from a process that crashed before it could answer health checks. Do not increase health-check timeouts to mask a startup or rejection error.

Verification: four local test groups passed, including automatic Render hostname recognition, an explicit custom domain, rejection of unrelated hosts, and the existing MCP/tool and safety checks. Public deployment has not been tested by Forge.

References: [Render health-check host and success criteria](https://render.com/docs/health-checks), [automatic Render URL](https://render.com/docs/environment-variables).
