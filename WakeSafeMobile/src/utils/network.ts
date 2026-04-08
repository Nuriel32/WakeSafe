import { CONFIG } from '../config';

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  fallbackMessage?: string;
};

export class NetworkError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function safeParseJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function toUserMessage(error: unknown, fallback = CONFIG.ERRORS.NETWORK): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return fallback;
  if (/abort|timeout/i.test(message)) return 'Server timeout. Please try again.';
  if (/network request failed|failed to fetch|offline|network/i.test(message)) {
    return 'No server connection. Please check network/server and retry.';
  }
  return message;
}

export async function requestJson(url: string, options: RequestOptions = {}) {
  const { timeoutMs = 12000, fallbackMessage = CONFIG.ERRORS.NETWORK, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    const data = await safeParseJson(response);
    if (!response.ok) {
      const serverMessage =
        data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`;
      throw new NetworkError(serverMessage, response.status);
    }
    return data;
  } catch (error) {
    throw new NetworkError(toUserMessage(error, fallbackMessage));
  } finally {
    clearTimeout(timeoutId);
  }
}
