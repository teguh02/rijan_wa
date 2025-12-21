/**
 * HTTP Client for local integration tests
 * Wrapper around Node.js fetch with timeout support
 */

export async function request({ method = 'GET', url, headers = {}, body, timeoutMs = 15000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    };

    if (body) {
      if (typeof body === 'string') {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, options);
    const text = await response.text();
    let json;

    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
      ok: response.ok,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout (${timeoutMs}ms): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForServer(baseUrl, timeoutMs = 30000) {
  const startTime = Date.now();
  const interval = 500;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await request({
        method: 'GET',
        url: `${baseUrl}/health`,
        timeoutMs: 5000,
      });

      if (response.status === 200) {
        return true;
      }
    } catch {
      // Continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms at ${baseUrl}`);
}
