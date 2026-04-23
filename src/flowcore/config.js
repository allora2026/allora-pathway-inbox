import { join } from 'node:path';

export const DEFAULT_RUNTIME_STORE_FILE = join('data', 'runtime-store.json');

export function getFlowcoreConfig(env = process.env) {
  return {
    apiKey: env.FLOWCORE_API_KEY ?? null,
    ingestionBaseUrl: env.FLOWCORE_INGESTION_BASE_URL ?? 'https://webhook.api.flowcore.io',
    tenant: env.FLOWCORE_TENANT ?? 'allora2026',
    dataCoreId: env.FLOWCORE_DATA_CORE_ID ?? '5b700879-58b4-49d0-afd9-43318e781457',
    dataCoreName: env.FLOWCORE_DATA_CORE_NAME ?? 'pathway-inbox',
    flowType: env.FLOWCORE_FLOW_TYPE ?? 'github-webhook.0',
    eventType: env.FLOWCORE_EVENT_TYPE ?? 'push.received.0',
    pathwayName: env.FLOWCORE_PATHWAY_NAME ?? 'pathway-inbox-github',
    runtimeStoreFile: env.RUNTIME_STORE_FILE ?? DEFAULT_RUNTIME_STORE_FILE
  };
}

export function getRuntimeStorePath({ root = process.cwd(), env = process.env } = {}) {
  return join(root, getFlowcoreConfig(env).runtimeStoreFile);
}
