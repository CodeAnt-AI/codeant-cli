import { getConfigValue } from './config.js';

export function getReviewMaxFiles(override) {
  const value = override ?? process.env.CODEANT_REVIEW_MAX_FILES ?? getConfigValue('reviewMaxFiles') ?? 100;
  const maxFiles = Number(value);
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(maxFiles) || maxFiles < 1) {
    throw new Error('Review max files must be a positive safe integer. Check --max-files, CODEANT_REVIEW_MAX_FILES, or reviewMaxFiles in ~/.codeant/config.json.');
  }
  return maxFiles;
}
