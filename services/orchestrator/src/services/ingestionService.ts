import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

export interface IngestDocumentPayload {
  tenantId: string;
  text: string;
  source: string;
  metadata?: Record<string, unknown>;
  requestId: string;
}

export async function enqueueDocument(payload: IngestDocumentPayload): Promise<string> {
  const log = createChildLogger({
    tenantId: payload.tenantId,
    source: payload.source,
    requestId: payload.requestId,
  });

  const response = await fetch(`${config.ragUrl}/index`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': payload.tenantId,
      'X-Request-ID': payload.requestId,
    },
    body: JSON.stringify({
      text: payload.text,
      source: payload.source,
      metadata: payload.metadata || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RAG index error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { chunks_indexed?: number };
  log.info({ chunksIndexed: result.chunks_indexed }, 'document_indexed');
  return 'idx-' + Date.now();
}
