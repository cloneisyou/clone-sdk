import type { components } from './generated/api-types.js';

export type PredictionInput = components['schemas']['PredictionInput'];
export type PredictionOutput = components['schemas']['PredictionOutput'];
export type CompletionRequest = Omit<PredictionInput, 'user_id'>;
export type PredictionEvent = components['schemas']['EventInput'];
export type PredictionTransport = (
  request: CompletionRequest, options: { signal: AbortSignal },
) => Promise<PredictionOutput>;
