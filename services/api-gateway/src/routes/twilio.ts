import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { validateTwilioSignature, extractCallerInfo } from '../middleware/twilioAuth.js';
import { proxyRequest } from '../services/proxyService.js';
import { logger } from '../utils/logger.js';
import { twilioCallsTotal, twilioCallDuration } from '../utils/metrics.js';

const router = Router();

// Default tenant for Twilio calls (can be mapped from phone number)
const DEFAULT_TENANT_ID = process.env.TWILIO_DEFAULT_TENANT_ID || 'default-tenant';

// Conversation store (in production, use Redis)
const conversations = new Map<string, {
  conversationId: string;
  tenantId: string;
  language: string;
  startTime: number;
  turns: number;
}>();

/**
 * Generate TwiML response
 */
const twiml = (content: string): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${content}
</Response>`;
};

/**
 * POST /twilio/voice/incoming
 * Initial webhook when Twilio receives an inbound call
 */
router.post(
  '/voice/incoming',
  validateTwilioSignature,
  async (req: Request, res: Response) => {
    const callerInfo = extractCallerInfo(req);
    const conversationId = uuidv4();

    logger.info({
      callSid: callerInfo.callSid,
      from: callerInfo.from,
      to: callerInfo.to,
      conversationId,
    }, 'Inbound call received');

    // Store conversation context
    conversations.set(callerInfo.callSid, {
      conversationId,
      tenantId: DEFAULT_TENANT_ID,
      language: 'en',
      startTime: Date.now(),
      turns: 0,
    });

    twilioCallsTotal.inc({ direction: 'inbound', status: 'started' });

    // Greet caller and gather speech input
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;

    res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">Welcome to FinSpot Voice Assistant. How can I help you today?</Say>
  <Gather input="speech"
         timeout="5"
         speechTimeout="auto"
         action="${baseUrl}/twilio/voice/gather"
         method="POST"
         language="en-IN">
  </Gather>
  <Say voice="Polly.Aditi">I didn't hear anything. Please call back when you're ready.</Say>
  <Hangup/>
`));
  }
);

/**
 * POST /twilio/voice/gather
 * Handle speech input from caller
 */
router.post(
  '/voice/gather',
  validateTwilioSignature,
  async (req: Request, res: Response, next: NextFunction) => {
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult;
    const confidence = parseFloat(req.body.Confidence || '0');

    const conversation = conversations.get(callSid);

    if (!conversation) {
      logger.warn({ callSid }, 'Conversation not found');
      res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">Sorry, there was an error. Please call back.</Say>
  <Hangup/>
`));
      return;
    }

    conversation.turns++;

    logger.info({
      callSid,
      conversationId: conversation.conversationId,
      speechResult,
      confidence,
      turn: conversation.turns,
    }, 'Speech input received');

    // Check for end of conversation
    const lowerSpeech = (speechResult || '').toLowerCase();
    if (lowerSpeech.includes('goodbye') || lowerSpeech.includes('bye') || lowerSpeech.includes('end call')) {
      conversations.delete(callSid);
      twilioCallsTotal.inc({ direction: 'inbound', status: 'completed' });

      res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">Thank you for calling. Goodbye!</Say>
  <Hangup/>
`));
      return;
    }

    try {
      // Send to LLM via orchestrator
      const llmStart = Date.now();
      const llmResult = await proxyRequest<{
        response: string;
        tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
      }>({
        service: 'orchestrator',
        method: 'POST',
        path: '/v1/chat',
        data: {
          tenant_id: conversation.tenantId,
          conversation_id: conversation.conversationId,
          text: speechResult,
          language: conversation.language,
          metadata: {
            source: 'twilio',
            call_sid: callSid,
            turn: conversation.turns,
          },
        },
        headers: {
          'X-Tenant-ID': conversation.tenantId,
          'X-Request-ID': uuidv4(),
        },
        timeout: 30000, // 30s timeout for LLM
      });
      const llmLatency = Date.now() - llmStart;

      logger.info({
        callSid,
        conversationId: conversation.conversationId,
        llmLatency,
        responseLength: llmResult.data.response.length,
      }, 'LLM response received');

      // Return response and continue gathering
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['host'];
      const baseUrl = `${protocol}://${host}`;

      // Escape XML special characters
      const escapedResponse = llmResult.data.response
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">${escapedResponse}</Say>
  <Gather input="speech"
         timeout="5"
         speechTimeout="auto"
         action="${baseUrl}/twilio/voice/gather"
         method="POST"
         language="en-IN">
  </Gather>
  <Say voice="Polly.Aditi">Is there anything else I can help you with?</Say>
  <Gather input="speech"
         timeout="3"
         speechTimeout="auto"
         action="${baseUrl}/twilio/voice/gather"
         method="POST"
         language="en-IN">
  </Gather>
  <Say voice="Polly.Aditi">Thank you for calling. Goodbye!</Say>
  <Hangup/>
`));
    } catch (err) {
      logger.error({
        callSid,
        conversationId: conversation.conversationId,
        err,
      }, 'LLM request failed');

      twilioCallsTotal.inc({ direction: 'inbound', status: 'error' });

      res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">I'm sorry, I'm having trouble processing your request. Please try again.</Say>
  <Gather input="speech"
         timeout="5"
         speechTimeout="auto"
         action="${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['host']}/twilio/voice/gather"
         method="POST"
         language="en-IN">
  </Gather>
  <Say voice="Polly.Aditi">Thank you for calling. Goodbye!</Say>
  <Hangup/>
`));
    }
  }
);

/**
 * POST /twilio/voice/status
 * Call status callback
 */
router.post(
  '/voice/status',
  validateTwilioSignature,
  async (req: Request, res: Response) => {
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    const callDuration = parseInt(req.body.CallDuration || '0', 10);

    logger.info({
      callSid,
      callStatus,
      callDuration,
    }, 'Call status update');

    // Clean up conversation on call end
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(callStatus)) {
      const conversation = conversations.get(callSid);

      if (conversation) {
        const duration = (Date.now() - conversation.startTime) / 1000;
        twilioCallDuration.observe({ status: callStatus }, duration);
        conversations.delete(callSid);
      }

      twilioCallsTotal.inc({ direction: 'inbound', status: callStatus });
    }

    res.status(204).send();
  }
);

/**
 * POST /twilio/voice/fallback
 * Error fallback URL
 */
router.post(
  '/voice/fallback',
  validateTwilioSignature,
  async (req: Request, res: Response) => {
    const callSid = req.body.CallSid;
    const errorCode = req.body.ErrorCode;
    const errorMessage = req.body.ErrorMessage;

    logger.error({
      callSid,
      errorCode,
      errorMessage,
    }, 'Twilio call error');

    twilioCallsTotal.inc({ direction: 'inbound', status: 'fallback' });

    res.type('text/xml').send(twiml(`
  <Say voice="Polly.Aditi">We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
`));
  }
);

/**
 * GET /twilio/health
 * Twilio webhook health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'twilio-webhook',
    timestamp: new Date().toISOString(),
    activeConversations: conversations.size,
  });
});

export default router;
