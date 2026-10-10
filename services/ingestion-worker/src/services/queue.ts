import { Worker, Queue, Job } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { indexDocument } from './ragIndexer.js';
import type { IngestDocumentPayload } from './ragIndexer.js';

const connection = { url: config.redisUrl };

export const ingestionQueue = new Queue<IngestDocumentPayload>(config.ingestionQueueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export async function enqueueDocument(payload: IngestDocumentPayload): Promise<string> {
  const job = await ingestionQueue.add('ingest-document', payload);
  logger.info({ jobId: job.id, tenantId: payload.tenantId, source: payload.source }, 'document_enqueued');
  return job.id || '';
}

function createWorker(): Worker<IngestDocumentPayload> {
  const worker = new Worker<IngestDocumentPayload>(
    config.ingestionQueueName,
    async (job: Job<IngestDocumentPayload>) => {
      const log = logger.child({
        jobId: job.id,
        tenantId: job.data.tenantId,
        source: job.data.source,
      });

      log.info('processing_document');
      const result = await indexDocument(job.data);
      log.info({ chunksIndexed: result.chunksIndexed }, 'document_processed');
      return result;
    },
    {
      connection,
      concurrency: config.ingestionConcurrency,
    }
  );

  worker.on('completed', (job: Job) => {
    logger.info({ jobId: job.id }, 'job_completed');
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({ jobId: job?.id, error: err.message }, 'job_failed');
  });

  worker.on('error', (err: Error) => {
    logger.error({ err }, 'worker_error');
  });

  return worker;
}

let worker: ReturnType<typeof createWorker> | null = null;

export function startWorker(): void {
  if (worker) return;
  worker = createWorker();
  logger.info({
    queue: config.ingestionQueueName,
    concurrency: config.ingestionConcurrency,
  }, 'ingestion_worker_started');
}

export async function stopWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
  logger.info('ingestion_worker_stopped');
}
