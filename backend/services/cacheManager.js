/**
 * Cache-Aside Manager
 *
 * Stores SDMX-JSON payloads to disk under data/cache/sdmx/ and in memory.
 * Cache keys = flow + key (via getUrlSafeCacheKey from sdmxApiClient).
 * TTL: 24 hours.
 *
 * Fallback: serves stale payload from disk if API call fails and cache exists.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getUrlSafeCacheKey } from "./sdmxApiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, "../../data/cache/sdmx");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache: { [cacheKey]: { payload, timestamp } }
const memoryCache = new Map();

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get the on-disk cache file path for a given cache key.
 * @param {string} cacheKey
 * @returns {string}
 */
function getCacheFilePath(cacheKey) {
  const safeName = encodeURIComponent(cacheKey) + ".json";
  return path.join(CACHE_DIR, safeName);
}

/**
 * Read a payload from the in-memory cache.
 * Returns null if not found or expired.
 * @param {string} cacheKey
 * @returns {Object|null}
 */
function getFromMemory(cacheKey) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

/**
 * Write a payload to the in-memory cache.
 * @param {string} cacheKey
 * @param {Object} payload
 */
function setInMemory(cacheKey, payload) {
  memoryCache.set(cacheKey, { payload, timestamp: Date.now() });
}

/**
 * Read a payload from the disk cache.
 * Returns null if file does not exist, is expired, or unreadable.
 * @param {string} cacheKey
 * @returns {Object|null}
 */
function getFromDisk(cacheKey) {
  try {
    const filePath = getCacheFilePath(cacheKey);
    if (!fs.existsSync(filePath)) return null;

    const stats = fs.statSync(filePath);
    const age = Date.now() - stats.mtimeMs;
    if (age > CACHE_TTL_MS) {
      // Remove expired cache file
      fs.unlinkSync(filePath);
      return null;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a payload to the disk cache.
 * @param {string} cacheKey
 * @param {Object} payload
 */
function setOnDisk(cacheKey, payload) {
  try {
    ensureCacheDir();
    const filePath = getCacheFilePath(cacheKey);
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.error("Cache disk write error:", err.message);
  }
}

/**
 * Fetch a stale (possibly expired) payload from disk, ignoring TTL.
 * Used as fallback when API is unreachable.
 * @param {string} cacheKey
 * @returns {Object|null}
 */
function getStaleFromDisk(cacheKey) {
  try {
    const filePath = getCacheFilePath(cacheKey);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Get a cached value from memory or disk (memory first).
 * @param {string} cacheKey
 * @returns {Object|null}
 */
function getCached(cacheKey) {
  // Memory first (fast path)
  const mem = getFromMemory(cacheKey);
  if (mem) return mem;

  // Fall back to disk
  const disk = getFromDisk(cacheKey);
  if (disk) {
    // Promote to memory
    setInMemory(cacheKey, disk);
    return disk;
  }

  return null;
}

/**
 * Set a cached value in both memory and disk.
 * @param {string} cacheKey
 * @param {Object} payload
 */
function setCached(cacheKey, payload) {
  setInMemory(cacheKey, payload);
  setOnDisk(cacheKey, payload);
}

/**
 * Clear cached entry for a given key.
 * @param {string} cacheKey
 */
function clearCache(cacheKey) {
  memoryCache.delete(cacheKey);
  try {
    const filePath = getCacheFilePath(cacheKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

export { CACHE_DIR, getCached, setCached, clearCache, getStaleFromDisk, getCacheFilePath };
