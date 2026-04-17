import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import crypto from 'crypto';

/**
 * Production-grade ID generation utility for XOVA AI ENGINE
 * Supports multiple ID formats with collision resistance and traceability
 */

export const ID_TYPES = {
  PROJECT: 'proj',
  SESSION: 'sess',
  FILE: 'file',
  DEPLOY: 'deploy',
  USER: 'user'
};

export const ID_LENGTHS = {
  SHORT: 8,
  MEDIUM: 12,
  LONG: 16,
  UUID: 36
};

/**
 * Generate a cryptographically secure unique ID
 * @param {string} prefix - ID type prefix (proj, sess, file, etc.)
 * @param {number} length - Length of random portion (excluding prefix and separators)
 * @param {boolean} includeTimestamp - Append timestamp for traceability
 * @returns {string} Formatted unique ID
 */
export function generateID(prefix = 'xova', length = ID_LENGTHS.MEDIUM, includeTimestamp = true) {
  if (!Object.values(ID_TYPES).includes(prefix) && prefix !== 'xova') {
    throw new Error(`Invalid ID prefix: ${prefix}. Must be one of: ${Object.values(ID_TYPES).join(', ')}`);
  }

  const randomBytes = crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  const timestamp = includeTimestamp ? `-${Date.now().toString(36).slice(-4)}` : '';
  
  return `${prefix}_${randomBytes}${timestamp}`;
}

/**
 * Generate UUID v4 with optional prefix
 * @param {string} prefix - Optional prefix for the UUID
 * @returns {string} UUID string
 */
export function generateUUID(prefix = null) {
  const id = uuidv4();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Validate ID format and integrity
 * @param {string} id - ID string to validate
 * @param {string} expectedPrefix - Expected prefix (optional)
 * @returns {boolean} True if valid
 */
export function validateID(id, expectedPrefix = null) {
  if (!id || typeof id !== 'string') return false;
  
  // Check UUID format
  if (uuidValidate(id)) return true;
  
  // Check custom format: prefix_random_timestamp
  const parts = id.split('_');
  if (parts.length < 2) return false;
  
  const [prefix, randomPart] = parts;
  
  if (expectedPrefix && prefix !== expectedPrefix) return false;
  if (!/^[a-z0-9]+$/.test(randomPart)) return false;
  
  return true;
}

/**
 * Extract metadata from XOVA ID
 * @param {string} id - ID to parse
 * @returns {object} Parsed metadata or null if invalid
 */
export function parseID(id) {
  if (!validateID(id)) return null;
  
  // UUID format
  if (uuidValidate(id)) {
    return {
      type: 'uuid',
      value: id,
      timestamp: null
    };
  }
  
  // Custom format: prefix_random_timestamp
  const parts = id.split('_');
  const [prefix, randomPart, timestampPart] = parts;
  
  const result = {
    type: prefix,
    random: randomPart,
    timestamp: null
  };
  
  if (timestampPart) {
    const timestamp = parseInt(timestampPart, 36);
    if (!isNaN(timestamp)) {
      result.timestamp = new Date(timestamp * 10000); // Approximate reconstruction
    }
  }
  
  return result;
}

/**
 * Generate project-specific ID with hierarchy support
 * @param {string} projectId - Parent project ID
 * @param {string} fileType - Type of file/component
 * @returns {string} Hierarchical ID
 */
export function generateHierarchicalID(projectId, fileType) {
  const fileID = generateID(ID_TYPES.FILE, ID_LENGTHS.SHORT, false);
  return `${projectId}/${fileType}/${fileID}`;
}

/**
 * Generate short URL-safe ID for public sharing
 * @param {number} length - Desired length (default: 8)
 * @returns {string} URL-safe ID
 */
export function generateShortID(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}

export default {
  generateID,
  generateUUID,
  validateID,
  parseID,
  generateHierarchicalID,
  generateShortID,
  ID_TYPES,
  ID_LENGTHS
};
