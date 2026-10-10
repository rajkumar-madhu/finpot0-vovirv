import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface IngestDocumentPayload {
  tenantId: string;
  text: string;
  source: string;
  metadata?: Record<string, unknown>;
  requestId: string;
}

export interface IngestResult {
  chunksIndexed: number;
  processingTime: number;
}

export async function indexDocument(payload: IngestDocumentPayload): Promise<IngestResult> {
  const log = logger.child({
    tenantId: payload.tenantId,
    source: payload.source,
    requestId: payload.requestId,
  });

  log.info({ textLength: payload.text.length }, 'indexing_document');

  try {
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

    const result = await response.json() as IngestResult;
    log.info(result, 'document_indexed');
    return result;
  } catch (err) {
    log.error({ err }, 'document_index_failed');
    throw err;
  }
}
