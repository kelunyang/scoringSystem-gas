/**
 * IP address utility functions
 * Uses ipify.org free API to get client's real IP address
 */

/**
 * Get client's real IP address from ipify.org
 * @returns {Promise<string>} IP address or 'unknown' if failed
 */
export async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      console.warn('Failed to fetch IP from ipify.org:', response.status);
      return 'unknown';
    }

    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    console.error('Error fetching client IP:', error);
    return 'unknown';
  }
}

/**
 * Get client IP with caching (valid for 5 minutes)
 * Reduces API calls for multiple operations in short time
 */
let cachedIP = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedClientIP() {
  const now = Date.now();

  // Return cached IP if still valid
  if (cachedIP && cacheTime && (now - cacheTime < CACHE_DURATION)) {
    return cachedIP;
  }

  // Fetch new IP and cache it
  cachedIP = await getClientIP();
  cacheTime = now;

  return cachedIP;
}

/**
 * Clear IP cache (useful for testing or when network changes)
 */
export function clearIPCache() {
  cachedIP = null;
  cacheTime = null;
}
