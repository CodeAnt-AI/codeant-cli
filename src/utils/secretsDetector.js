import { parse } from 'smol-toml';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '..', 'rules', 'secrets.toml');

let _cachedConfig = null;

/** Convert a Go-style regex string to a JS RegExp, returning null on failure. */
function toRegExp(pattern, extraFlags = '') {
  const hasInlineI = pattern.includes('(?i)');
  const cleaned = pattern.replace(/\(\?i\)/g, '');
  const flags = extraFlags + (hasInlineI ? 'i' : '');
  try {
    return new RegExp(cleaned, flags);
  } catch {
    return null;
  }
}

function loadConfig() {
  if (_cachedConfig) return _cachedConfig;
  const raw = readFileSync(RULES_PATH, 'utf-8');
  const config = parse(raw);

  const globalAllowlist = {
    paths: (config.allowlist?.paths || []).map(p => toRegExp(p)).filter(Boolean),
    regexes: (config.allowlist?.regexes || []).map(r => toRegExp(r)).filter(Boolean),
    stopwords: config.allowlist?.stopwords || [],
  };

  const rules = (config.rules || [])
    .filter(r => r.regex && !r.skipReport)
    .map(r => {
      const allowlists = (r.allowlists || []).map(a => ({
        regexes: (a.regexes || []).map(re => toRegExp(re)).filter(Boolean),
        paths: (a.paths || []).map(p => toRegExp(p)).filter(Boolean),
        stopwords: a.stopwords || [],
        regexTarget: a.regexTarget || 'secret',
        condition: a.condition || 'OR',
      }));

      return {
        id: r.id,
        description: r.description || '',
        regexRaw: r.regex,
        entropy: r.entropy || 0,
        keywords: r.keywords || [],
        secretGroup: r.secretGroup || 0,
        allowlists,
      };
    });

  // Build keyword -> rules index for fast pre-filtering
  const keywordIndex = new Map();
  const noKeywordRules = [];
  for (const rule of rules) {
    if (rule.keywords.length === 0) {
      noKeywordRules.push(rule);
    } else {
      for (const kw of rule.keywords) {
        const lower = kw.toLowerCase();
        if (!keywordIndex.has(lower)) keywordIndex.set(lower, []);
        keywordIndex.get(lower).push(rule);
      }
    }
  }

  _cachedConfig = { rules, globalAllowlist, keywordIndex, noKeywordRules };
  return _cachedConfig;
}

function shannonEntropy(str) {
  if (!str) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isAllowlistedValue(secret, globalAllowlist) {
  for (const re of globalAllowlist.regexes) {
    if (re.test(secret)) return true;
  }
  for (const sw of globalAllowlist.stopwords) {
    if (secret.includes(sw)) return true;
  }
  return false;
}

function isAllowlistedPath(filePath, globalAllowlist) {
  for (const re of globalAllowlist.paths) {
    if (re.test(filePath)) return true;
  }
  return false;
}

function checkRuleAllowlists(secret, matchStr, filePath, allowlists) {
  for (const al of allowlists) {
    const target = al.regexTarget === 'match' ? matchStr : secret;
    const pathAllowed = al.paths.length > 0 && al.paths.some(p => p.test(filePath));
    const regexAllowed = al.regexes.length > 0 && al.regexes.some(r => r.test(target));
    const stopwordAllowed = al.stopwords.length > 0 && al.stopwords.some(sw => target.includes(sw));

    if (al.condition === 'AND') {
      const checks = [];
      if (al.paths.length > 0) checks.push(pathAllowed);
      if (al.regexes.length > 0) checks.push(regexAllowed);
      if (al.stopwords.length > 0) checks.push(stopwordAllowed);
      if (checks.length > 0 && checks.every(Boolean)) return true;
    } else {
      if (pathAllowed || regexAllowed || stopwordAllowed) return true;
    }
  }
  return false;
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function maskSecret(secret) {
  if (secret.length <= 8) return '*'.repeat(secret.length);
  return secret.slice(0, 4) + '*'.repeat(Math.min(secret.length - 8, 20)) + secret.slice(-4);
}

/**
 * Scan a single file's full content for secrets.
 * Scans the entire file regardless of which lines changed (same as GitHub push protection).
 */
export function scanFile(filePath, content) {
  const config = loadConfig();
  const { globalAllowlist, keywordIndex, noKeywordRules } = config;

  if (isAllowlistedPath(filePath, globalAllowlist)) return [];

  const contentLower = content.toLowerCase();
  const findings = [];
  const seen = new Set();

  // Collect candidate rules via keyword pre-filter
  const candidateRules = new Set(noKeywordRules);
  for (const [keyword, rules] of keywordIndex) {
    if (contentLower.includes(keyword)) {
      for (const r of rules) candidateRules.add(r);
    }
  }

  for (const rule of candidateRules) {
    const regex = toRegExp(rule.regexRaw, 'g');
    if (!regex) continue;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const secret = match[rule.secretGroup] || fullMatch;
      const lineNum = getLineNumber(content, match.index);

      // Dedup by rule+line
      const key = `${rule.id}:${lineNum}`;
      if (seen.has(key)) continue;

      // Entropy check
      if (rule.entropy > 0 && shannonEntropy(secret) < rule.entropy) continue;

      // Global allowlist checks
      if (isAllowlistedValue(secret, globalAllowlist)) continue;

      // Per-rule allowlist checks
      if (checkRuleAllowlists(secret, fullMatch, filePath, rule.allowlists)) continue;

      seen.add(key);
      findings.push({
        type: rule.id,
        description: rule.description,
        line_number: lineNum,
        secret_snippet: maskSecret(secret),
      });
    }
  }

  return findings;
}

/**
 * Scan multiple files for secrets.
 * Scans the full content of each file (not just diffs).
 * @param {Array} files - Array of {file_path, code}
 * @returns {Array} Array of {file_path, secrets: [...]}
 */
export function detectSecrets(files) {
  const results = [];
  for (const file of files) {
    const secrets = scanFile(file.file_path, file.code);
    results.push({ file_path: file.file_path, secrets });
  }
  return results;
}
