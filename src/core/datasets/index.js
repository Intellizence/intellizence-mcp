import { registerFundraising } from './fundraising.js';
import { registerLayoffs } from './layoffs.js';
import { registerMna } from './mna.js';
import { registerBusinessExpansion } from './business-expansion.js';
import { registerDataBreach } from './data-breach.js';
import { registerExecutiveChange } from './executive-change.js';
import { registerNews } from './news.js';
import config from '../config.js';

const DATASET_REGISTRY = [
  { key: 'fundraising', register: registerFundraising },
  { key: 'layoffs', register: registerLayoffs },
  { key: 'mna', register: registerMna },
  { key: 'business-expansion', register: registerBusinessExpansion },
  { key: 'data-breach', register: registerDataBreach },
  { key: 'executive-change', register: registerExecutiveChange },
  { key: 'news', register: registerNews },
];

function parseEnabledDatasets() {
  const raw = config && config.enabledDatasets;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const str = String(raw || '').trim();
  if (!str) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function registerEnabledDatasets(server, deps) {
  const enabled = new Set(parseEnabledDatasets());
  for (const ds of DATASET_REGISTRY) {
    if (enabled.has(ds.key)) {
      ds.register(server, deps);
    }
  }
}

export { registerEnabledDatasets };
