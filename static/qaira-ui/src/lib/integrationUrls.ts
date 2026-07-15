import type { Integration } from "../types";

function readConfigUrl(integration: Integration | null | undefined, keys: string[]) {
  const config = integration?.config && typeof integration.config === "object" ? integration.config : {};

  for (const key of keys) {
    const value = config[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function isLocalFrontendHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function resolveSameOriginProxyUrl(parsed: URL) {
  if (typeof window === "undefined" || isLocalFrontendHost()) {
    return "";
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isTestEnginePort = parsed.port === "4301";
  const isJaegerPort = parsed.port === "16686";

  if (!localHosts.has(parsed.hostname) || (!isTestEnginePort && !isJaegerPort)) {
    return "";
  }

  const proxyPrefix = isJaegerPort ? "/jaeger" : "/testengine";
  return new URL(`${proxyPrefix}/`, window.location.origin).toString();
}

export function resolveBrowserBaseUrl(
  integration: Integration | null | undefined,
  publicConfigKeys: string[] = ["public_base_url"]
) {
  let configuredPublicUrl = readConfigUrl(integration, publicConfigKeys);

  if (configuredPublicUrl) {
    try {
      const parsed = new URL(configuredPublicUrl);
      const sameOriginProxyUrl = resolveSameOriginProxyUrl(parsed);

      if (sameOriginProxyUrl) {
        return sameOriginProxyUrl;
      }

      if (isLocalFrontendHost() && ["testengine", "host.docker.internal"].includes(parsed.hostname)) {
        parsed.hostname = "localhost";
        configuredPublicUrl = parsed.toString();
      }
    } catch {
      return configuredPublicUrl;
    }

    return configuredPublicUrl;
  }

  const baseUrl = String(integration?.base_url || "").trim();

  if (!baseUrl) {
    return "";
  }

  try {
    const parsed = new URL(baseUrl);
    const sameOriginProxyUrl = resolveSameOriginProxyUrl(parsed);

    if (sameOriginProxyUrl) {
      return sameOriginProxyUrl;
    }

    if (isLocalFrontendHost() && ["testengine", "host.docker.internal"].includes(parsed.hostname)) {
      parsed.hostname = "localhost";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    return "";
  }

  return baseUrl.replace(/\/+$/, "");
}

export function buildBrowserUrl(
  integration: Integration | null | undefined,
  path = "/",
  publicConfigKeys: string[] = ["public_base_url"]
) {
  const baseUrl = resolveBrowserBaseUrl(integration, publicConfigKeys);

  if (!baseUrl) {
    return "";
  }

  try {
    return new URL(path, `${baseUrl}/`).toString();
  } catch {
    return "";
  }
}
