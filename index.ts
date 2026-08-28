import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installGateways } from "./gateway.ts";
import { GATEWAYS } from "./providers.ts";

export * from "./gateway.ts";
export * from "./providers.ts";

export default function openAIGatewaysExtension(pi: ExtensionAPI): void {
  installGateways(pi, GATEWAYS);
}
