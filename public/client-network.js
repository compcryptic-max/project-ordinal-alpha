// Writes are deliberately never retried: a lost response may still have changed the world.
export class RequestError extends Error {
  constructor(message, {status = 0, code = 'connection_failed'} = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
  }
}

export function createApi({fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  return async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const method = options.method || 'GET';
    try {
      const response = await fetchImpl(path, {
        method, signal: controller.signal,
        headers: options.body ? {'content-type': 'application/json'} : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      let result;
      try { result = await response.json(); }
      catch {
        throw new RequestError('The world server returned an unreadable response. Try reconnecting.', {
          status: response.status, code: 'invalid_response'
        });
      }
      if (!response.ok) throw new RequestError(result.error || 'The world server could not complete this request.', {
        status: response.status, code: result.error || 'server_error'
      });
      return result;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      const timedOut = controller.signal.aborted;
      const explanation = method === 'GET'
        ? 'Reconnect to load your saved progress.'
        : 'The action may have reached the server. Reconnect to check before repeating it.';
      throw new RequestError((timedOut ? 'Connection timed out. ' : 'Connection interrupted. ') + explanation, {
        code: timedOut ? 'request_timeout' : 'connection_failed'
      });
    } finally { clearTimeout(timeout); }
  };
}

export function isMissingIdentity(error) {
  return error instanceof RequestError && ['session_not_found', 'player_not_found'].includes(error.code)
    && error.status === 404;
}
