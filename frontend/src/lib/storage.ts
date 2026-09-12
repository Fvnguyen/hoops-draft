/**
 * Safe localStorage helpers with quota management
 */

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/**
 * Safely read and parse JSON from localStorage
 * Returns fallback if key doesn't exist, parsing fails, or window is undefined
 */
export function safeGetJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return fallback;
    }
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage
 * Throws StorageQuotaError if storage is full
 */
export function safeSetJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error: unknown) {
    // Check if this is a quota exceeded error
    if (error instanceof DOMException) {
      if (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014
      ) {
        throw new StorageQuotaError(
          "Browser storage is full (~5 MB limit). Delete old drafts/seasons from the Rosters page or export them from /debug."
        );
      }
    }
    // Re-throw other errors as-is
    throw error;
  }
}

/**
 * Calculate approximate storage usage in bytes
 * Sums length of all keys and values (×2 for encoding)
 */
export function storageUsageBytes(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        // Rough estimate: each character is ~2 bytes when UTF-16 encoded
        bytes += (key.length + value.length) * 2;
      }
    }
  }
  return bytes;
}
