import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  browser: {
    headless: false,
    channel: 'chrome',
    userDataDir: path.join(ROOT, '.chrome-profile'),
    slowMoMs: 50,
  },
  behavior: {
    applyToOpportunities: true,
    applyToCustomSearch: true,
    maxApplicationsPerRun: 100,
    delayBetweenApplicationsMs: [1500, 4000],
    dryRun: false,
  },
  filters: {
    skills: [],
    jobFunctions: [],
    industries: [],
    locations: [],
    companies: [],
    companySize: [],
    experience: { min: null, max: null },
  },
};

function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function mergeDeep(base, override) {
  if (override == null) return base;
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (typeof base === 'object' && base !== null && !Array.isArray(base)) {
    const out = { ...base };
    for (const k of Object.keys(override)) {
      if (k in out && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
        out[k] = mergeDeep(out[k], override[k]);
      } else {
        out[k] = override[k] !== undefined ? override[k] : out[k];
      }
    }
    return out;
  }
  return override !== undefined ? override : base;
}

/**
 * @param {string} [configPath]
 */
export function loadConfig(configPath = path.join(ROOT, 'config.json')) {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing ${configPath}. Copy config.example.json to config.json and fill in credentials.`,
    );
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${configPath}: ${e.message}`);
  }

  const cfg = mergeDeep(
    {
      credentials: { email: '', password: '' },
      ...DEFAULTS,
    },
    raw,
  );

  // Resolve userDataDir relative to project root
  if (typeof cfg.browser.userDataDir === 'string' && !path.isAbsolute(cfg.browser.userDataDir)) {
    cfg.browser.userDataDir = path.resolve(ROOT, cfg.browser.userDataDir);
  }

  if (!isNonEmptyString(cfg.credentials?.email)) {
    throw new Error('config.credentials.email is required');
  }
  if (!isNonEmptyString(cfg.credentials?.password)) {
    throw new Error('config.credentials.password is required');
  }

  const delay = cfg.behavior.delayBetweenApplicationsMs;
  if (!Array.isArray(delay) || delay.length !== 2 || delay[0] > delay[1]) {
    throw new Error('behavior.delayBetweenApplicationsMs must be [minMs, maxMs] with min <= max');
  }

  const exp = cfg.filters.experience;
  if (exp && typeof exp === 'object') {
    if (exp.min != null && typeof exp.min !== 'number') {
      throw new Error('filters.experience.min must be a number or null');
    }
    if (exp.max != null && typeof exp.max !== 'number') {
      throw new Error('filters.experience.max must be a number or null');
    }
  }

  for (const key of ['skills', 'jobFunctions', 'industries', 'locations', 'companies', 'companySize']) {
    if (!Array.isArray(cfg.filters[key])) {
      cfg.filters[key] = [];
    }
  }

  return cfg;
}

export { ROOT };
