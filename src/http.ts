/** A safe service error code and HTTP status, without request or response bodies. */
export class ClonePredictionError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'ClonePredictionError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decode the object-shaped API envelope. Do not swallow aborted body reads. */
export async function readResponse(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  if (!response.ok) {
    const detail = isObject(body) && isObject(body.detail) ? body.detail : undefined;
    // Only structured error codes may cross into host UI/logs, never arbitrary text.
    const code = typeof detail?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(detail.code)
      ? detail.code : 'prediction_request_failed';
    throw new ClonePredictionError(code, response.status);
  }
  if (!isObject(body)) throw new ClonePredictionError('invalid_response', 502);
  return body;
}
