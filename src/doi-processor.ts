import fs from 'node:fs/promises';

import { CACHE_FILE, CREDIT_LIMIT, CROSSREF_EMAIL, KGX3_API_KEY, KGX3_API_URL } from './config.js';
import logger from './logger.js';

interface DoiMetadata {
  title: string;
  pdfUrl?: string;
  authors?: string[];
  journal?: string;
  year?: number;
}

interface Classification {
  classification: string;
  confidence?: number;
}

interface CacheEntry {
  doi: string;
  metadata: DoiMetadata;
  classification?: Classification;
  processedAt: string;
}

interface CacheData {
  entries: Record<string, CacheEntry>;
  creditsUsed: number;
  lastUpdated: string;
}

let cache: CacheData = {
  entries: {},
  creditsUsed: 0,
  lastUpdated: new Date().toISOString(),
};

/**
 * Extracts DOI from text using regex pattern.
 *
 * @param {string} text - Text to search for DOI patterns.
 * @returns {string | null} The extracted DOI in lowercase, or null if not found.
 */
export function extractDoi(text: string): string | null {
  const doiRegex = /(?:https?:\/\/)?(?:dx\.)?doi\.org\/?(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/gi;
  const directDoiRegex = /(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/gi;

  let match = doiRegex.exec(text);
  if (match) {
    return match[1].toLowerCase();
  }

  match = directDoiRegex.exec(text);
  if (match) {
    return match[1].toLowerCase();
  }

  return null;
}

/**
 * Fetches metadata from Crossref API for a given DOI.
 *
 * @async
 * @param {string} doi - The DOI to fetch metadata for.
 * @returns {Promise<DoiMetadata>} The paper metadata.
 * @throws {Error} When API request fails or DOI not found.
 */
export async function fetchCrossrefMetadata(doi: string): Promise<DoiMetadata> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const headers = {
    'User-Agent': 'Bluesky DOI Labeler (mailto:' + CROSSREF_EMAIL + ')',
    Accept: 'application/json',
  };

  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`Crossref API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const work = data.message;

    if (!work) {
      throw new Error('No work data found in Crossref response');
    }

    const title = Array.isArray(work.title) ? work.title[0] : work.title || '';
    const authors = work.author?.map((author: any) => `${author.given || ''} ${author.family || ''}`.trim()) || [];

    let pdfUrl: string | undefined;
    if (Array.isArray(work.link)) {
      const pdfLink = work.link.find((link: any) => link['content-type'] === 'application/pdf');
      if (pdfLink) {
        pdfUrl = pdfLink.URL;
      }
    }

    const journal = work['container-title']?.[0] || '';
    const year = work.published?.['date-parts']?.[0]?.[0] || undefined;

    logger.info(`Fetched metadata for DOI ${doi}: "${title}"`);

    return {
      title,
      pdfUrl,
      authors,
      journal,
      year,
    };
  } catch (error) {
    logger.error(`Error fetching Crossref metadata for ${doi}: ${error}`);
    throw error;
  }
}

/**
 * Classifies a paper using the KGX3 API.
 *
 * @async
 * @param {string} title - The paper title.
 * @param {string} pdfUrl - The PDF URL (optional, but preferred for better classification).
 * @returns {Promise<Classification>} The classification result.
 * @throws {Error} When API request fails or credits exhausted.
 */
export async function classifyPaper(title: string, pdfUrl?: string): Promise<Classification> {
  if (cache.creditsUsed >= CREDIT_LIMIT) {
    throw new Error(`Credit limit of ${CREDIT_LIMIT} reached. Cannot classify more papers.`);
  }

  if (!KGX3_API_KEY) {
    throw new Error('KGX3_API_KEY not configured');
  }

  const payload = {
    title,
    pdf_url: pdfUrl || '',
    email: CROSSREF_EMAIL,
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': KGX3_API_KEY,
  };

  try {
    logger.info(`Classifying paper: "${title}" (Credits used: ${cache.creditsUsed}/${CREDIT_LIMIT})`);

    const response = await fetch(KGX3_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`KGX3 API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    cache.creditsUsed++;
    await saveCache();

    logger.info(`Paper classified as: ${result.classification} (Credits used: ${cache.creditsUsed}/${CREDIT_LIMIT})`);

    return {
      classification: result.classification,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error(`Error classifying paper "${title}": ${error}`);
    throw error;
  }
}

/**
 * Maps KGX3 classification to badge identifier.
 *
 * @param {string} classification - The KGX3 classification.
 * @returns {string | null} The corresponding badge identifier, or null if no mapping found.
 */
export function mapClassificationToBadge(classification: string): string | null {
  const mapping: Record<string, string> = {
    'Paradigm Shift': 'paradigm-shift',
    'Model Revolution': 'model-revolution',
    'Normal Science': 'normal-science',
    'Model Crisis': 'model-crisis',
    'Model Drift': 'model-drift',
  };

  return mapping[classification] || null;
}

/**
 * Loads cache from disk.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function loadCache(): Promise<void> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    cache = JSON.parse(data);
    logger.info(`Cache loaded: ${Object.keys(cache.entries).length} entries, ${cache.creditsUsed} credits used`);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      logger.info('No cache file found, starting fresh');
      await saveCache();
    } else {
      logger.error(`Error loading cache: ${error}`);
    }
  }
}

/**
 * Saves cache to disk.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function saveCache(): Promise<void> {
  try {
    cache.lastUpdated = new Date().toISOString();
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    logger.error(`Error saving cache: ${error}`);
  }
}

/**
 * Processes a DOI: extracts metadata, classifies if needed, and returns badge identifier.
 *
 * @async
 * @param {string} doi - The DOI to process.
 * @returns {Promise<string | null>} The badge identifier, or null if processing failed.
 */
export async function processDoi(doi: string): Promise<string | null> {
  try {
    // Check cache first
    if (cache.entries[doi]) {
      const entry = cache.entries[doi];
      if (entry.classification) {
        logger.info(`Using cached classification for DOI ${doi}: ${entry.classification.classification}`);
        return mapClassificationToBadge(entry.classification.classification);
      }
    }

    // Fetch metadata if not cached
    let metadata: DoiMetadata;
    if (cache.entries[doi]?.metadata) {
      metadata = cache.entries[doi].metadata;
    } else {
      metadata = await fetchCrossrefMetadata(doi);

      // Cache the metadata
      cache.entries[doi] = {
        doi,
        metadata,
        processedAt: new Date().toISOString(),
      };
      await saveCache();
    }

    if (!metadata.title) {
      logger.warn(`No title found for DOI ${doi}, skipping classification`);
      return null;
    }

    // Skip classification if no PDF URL and we want to conserve credits
    if (!metadata.pdfUrl) {
      logger.warn(`No PDF URL found for DOI ${doi}, skipping classification to conserve credits`);
      return null;
    }

    // Classify the paper
    const classification = await classifyPaper(metadata.title, metadata.pdfUrl);

    // Update cache with classification
    cache.entries[doi].classification = classification;
    await saveCache();

    return mapClassificationToBadge(classification.classification);
  } catch (error) {
    logger.error(`Error processing DOI ${doi}: ${error}`);
    return null;
  }
}

/**
 * Gets current cache statistics.
 *
 * @returns {{ totalEntries: number; creditsUsed: number; creditLimit: number; }}
 */
export function getCacheStats() {
  return {
    totalEntries: Object.keys(cache.entries).length,
    creditsUsed: cache.creditsUsed,
    creditLimit: CREDIT_LIMIT,
  };
}
