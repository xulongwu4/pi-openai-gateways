# pi-openai-gateways

A [Pi](https://pi.dev) extension that registers free-model providers for:

- `kilo` — [Kilo AI Gateway](https://kilo.ai/docs/gateway)
- `aihubmix` — [AIHubMix](https://docs.aihubmix.com/)
- `cline` — [Cline API](https://github.com/cline/cline/tree/main/docs/api)
- `tokenrouter` — [TokenRouter](https://www.tokenrouter.com/)

All use Pi's native OpenAI Chat Completions transport, API-key login, cache-first startup, non-blocking catalog refresh, `models.json` base URL overrides, and `route-marker.ts`.

## Install

```sh
pi install /path/to/pi-openai-gateways
export KILO_API_KEY="your-kilo-key"
export AIHUBMIX_API_KEY="your-aihubmix-key"
export CLINE_API_KEY="your-cline-key"
export TOKENROUTER_API_KEY="your-tokenrouter-key"
pi
```

You can instead use `/login` and select **Kilo Gateway**, **AIHubMix**, **Cline**, or **TokenRouter**. Pi stores each key in `auth.json`.

The extension exposes only free chat-compatible models. Kilo uses its catalog's `isFree` and capability metadata. AIHubMix identifies free models by its documented `-free` suffix and conservatively omits IDs for non-chat endpoint families because its model list has no capability metadata. Cline combines `recommended-models.free` with tool-capable catalog entries that are explicitly free-marked and zero-priced; ClinePass is intentionally not registered. TokenRouter keeps text-chat models whose IDs end in `-free` or `:free`; its authenticated model catalog receives the resolved TokenRouter API key.

Successful catalogs are cached with `0600` permissions at:

- `$PI_CODING_AGENT_DIR/kilo/models.json`
- `$PI_CODING_AGENT_DIR/aihubmix/models.json`
- `$PI_CODING_AGENT_DIR/cline/models.json`
- `$PI_CODING_AGENT_DIR/tokenrouter/models.json`

## Base URL and route-marker

```json
{
  "providers": {
    "kilo": {
      "baseUrl": "http://localhost:8788",
      "routeMarker": "route_to"
    },
    "aihubmix": {
      "baseUrl": "http://localhost:8788",
      "routeMarker": "route_to"
    },
    "cline": {
      "baseUrl": "http://localhost:8788",
      "routeMarker": "route_to"
    },
    "tokenrouter": {
      "baseUrl": "http://localhost:8788",
      "routeMarker": "route_to"
    }
  }
}
```

Catalog discovery remains direct at each provider's documented `/models` endpoint. Overrides apply to inference.

## Reusing the library

```ts
import { installGateways, type GatewaySpec } from "pi-openai-gateways/gateway";
```

A `GatewaySpec` supplies identity, endpoint/auth settings, fallback models, compatibility defaults, and a catalog adapter. The shared module owns native provider construction, caching, and background refresh.

## Development

```sh
npm install
npm test
npm run typecheck
```
