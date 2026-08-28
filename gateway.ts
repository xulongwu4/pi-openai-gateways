import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createProvider,
  envApiKeyAuth,
  openAICompletionsApi,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai/compat";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CATALOG_TIMEOUT_MS = 15_000;
export type GatewayModel = Model<"openai-completions">;
export type DiscoveredModel = Pick<GatewayModel, "id"> & Partial<
  Pick<
    GatewayModel,
    | "name"
    | "reasoning"
    | "thinkingLevelMap"
    | "input"
    | "cost"
    | "contextWindow"
    | "maxTokens"
    | "headers"
    | "compat"
  >
>;

export interface GatewaySpec {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  fallbackModels: readonly DiscoveredModel[];
  compat?: GatewayModel["compat"];
  catalogPaths: readonly string[];
  catalogRequiresAuth?: boolean;
  parseCatalog(payloads: readonly unknown[]): DiscoveredModel[];
}

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function materialize(spec: GatewaySpec, model: DiscoveredModel): GatewayModel {
  return {
    id: model.id,
    name: model.name ?? model.id,
    api: "openai-completions",
    provider: spec.id,
    baseUrl: spec.baseUrl,
    reasoning: model.reasoning ?? false,
    thinkingLevelMap: model.thinkingLevelMap,
    input: model.input ?? ["text"],
    cost: model.cost ?? ZERO_COST,
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 16_384,
    headers: model.headers,
    compat: { ...spec.compat, ...model.compat },
  };
}

function cachePath(spec: GatewaySpec, agentDir: string): string {
  return join(agentDir, spec.id, "models.json");
}

function loadCachedModels(spec: GatewaySpec, agentDir: string): GatewayModel[] | undefined {
  try {
    const models = JSON.parse(readFileSync(cachePath(spec, agentDir), "utf8")) as GatewayModel[];
    if (
      !Array.isArray(models) ||
      models.length === 0 ||
      models.some((model) =>
        typeof model?.id !== "string" ||
        typeof model?.name !== "string" ||
        model.provider !== spec.id ||
        model.api !== "openai-completions" ||
        !Array.isArray(model.input) ||
        typeof model.contextWindow !== "number" ||
        typeof model.maxTokens !== "number"
      )
    ) return undefined;
    return models;
  } catch {
    return undefined;
  }
}

function writeCachedModels(spec: GatewaySpec, models: GatewayModel[], agentDir: string): void {
  try {
    const path = cachePath(spec, agentDir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(models, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    // Cache failures must not hide a valid live catalog.
  }
}

export function getCachedOrFallbackModels(
  spec: GatewaySpec,
  agentDir = getAgentDir(),
): GatewayModel[] {
  return loadCachedModels(spec, agentDir) ?? spec.fallbackModels.map((model) => materialize(spec, model));
}

export async function loadGatewayModels(
  spec: GatewaySpec,
  fetcher: typeof fetch = fetch,
  agentDir = getAgentDir(),
  signal?: AbortSignal,
  apiKey?: string,
): Promise<GatewayModel[]> {
  try {
    if (spec.catalogRequiresAuth && !apiKey) throw new Error(`${spec.name} catalog requires an API key`);
    const timeout = AbortSignal.timeout(CATALOG_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const payloads = await Promise.all(spec.catalogPaths.map(async (path) => {
      const url = `${spec.baseUrl}/${path.replace(/^\/+/, "")}`;
      const response = await fetcher(url, {
        headers: {
          Accept: "application/json",
          ...(spec.catalogRequiresAuth ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: requestSignal,
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      return response.json();
    }));
    const discovered = spec.parseCatalog(payloads);
    const models = [...new Map(
      discovered.map((model) => [model.id, materialize(spec, model)] as const),
    ).values()];
    if (models.length === 0) throw new Error(`${spec.name} returned no free chat models`);
    writeCachedModels(spec, models, agentDir);
    return models;
  } catch {
    return getCachedOrFallbackModels(spec, agentDir);
  }
}

export function createGatewayProvider(
  spec: GatewaySpec,
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): Provider<"openai-completions"> {
  return createProvider({
    id: spec.id,
    name: spec.name,
    baseUrl: spec.baseUrl,
    auth: { apiKey: envApiKeyAuth(`${spec.name} API key`, [spec.apiKeyEnv]) },
    models: getCachedOrFallbackModels(spec, agentDir),
    async fetchModels(context) {
      const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
      return loadGatewayModels(spec, fetcher, agentDir, context.signal, apiKey);
    },
    api: openAICompletionsApi(),
  });
}

export function installGateways(
  pi: ExtensionAPI,
  specs: readonly GatewaySpec[],
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): void {
  for (const spec of specs) pi.registerProvider(createGatewayProvider(spec, fetcher, agentDir));
  const providerIds = specs.map((spec) => spec.id);

  pi.on("session_start", (_event, ctx) => {
    void ctx.modelRegistry.refresh({ providers: providerIds }).then((result) => {
      for (const [provider, error] of result.errors) {
        console.warn(`[pi-openai-gateways] ${provider} refresh failed: ${error.message}`);
      }
    }).catch((error) => {
      console.warn(`[pi-openai-gateways] Model refresh failed: ${String(error)}`);
    });
  });
}
