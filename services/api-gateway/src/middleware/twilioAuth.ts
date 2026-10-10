import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Twilio webhook signature validation middleware
 * Validates X-Twilio-Signature header using HMAC-SHA1
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

/**
 * Build the validation string from request URL and body
 */
const buildValidationString = (url: string, params: Record<string, string>): string => {
  // Sort parameters alphabetically and concatenate
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');

  return url + sortedParams;
};

/**
 * Calculate expected signature
 */
const calculateSignature = (authToken: string, validationString: string): string => {
  return crypto
    .createHmac('sha1', authToken)
    .update(validationString, 'utf-8')
    .digest('base64');
};

/**
 * Validate Twilio webhook signature
 */
export const validateTwilioSignature = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Skip validation in development if no auth token configured
  if (!TWILIO_AUTH_TOKEN) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Twilio auth token not configured, skipping signature validation');
      return next();
    }
    logger.error('Twilio auth token not configured');
    _res.status(500).type('text/xml').send(`
      <Response>
        <Say>Service configuration error. Please try again later.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;

  if (!twilioSignature) {
    logger.warn({ path: req.path }, 'Missing Twilio signature');
    _res.status(403).type('text/xml').send(`
      <Response>
        <Say>Unauthorized request.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  // Build the full URL (Twilio signs the full URL including protocol)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['host'] || req.hostname;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  // Build validation string from URL and POST params
  const validationString = buildValidationString(fullUrl, req.body || {});
  const expectedSignature = calculateSignature(TWILIO_AUTH_TOKEN, validationString);

  // Timing-safe comparison
  const signatureValid = crypto.timingSafeEqual(
    Buffer.from(twilioSignature),
    Buffer.from(expectedSignature)
  );

  if (!signatureValid) {
    logger.warn({
      path: req.path,
      url: fullUrl,
    }, 'Invalid Twilio signature');

    _res.status(403).type('text/xml').send(`
      <Response>
        <Say>Unauthorized request.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  logger.debug({ path: req.path }, 'Twilio signature validated');
  next();
};

/**
 * Extract caller info from Twilio request
 */
export const extractCallerInfo = (req: Request): {
  callSid: string;
  from: string;
  to: string;
  direction: string;
  callerName?: string;
  callerCity?: string;
  callerState?: string;
  callerCountry?: string;
} => {
  return {
    callSid: req.body.CallSid || '',
    from: req.body.From || '',
    to: req.body.To || '',
    direction: req.body.Direction || 'inbound',
    callerName: req.body.CallerName,
    callerCity: req.body.FromCity,
    callerState: req.body.FromState,
    callerCountry: req.body.FromCountry,
  };
};
