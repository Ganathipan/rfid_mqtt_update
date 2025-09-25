// In-memory configuration for Game Session Manager (Lite)
// Defaults are safe and minimal; can be tweaked via /api/game-lite/config

const defaultConfig = {
  enabled: true,
  rules: {
    eligibleLabelPrefix: 'CLUSTER', // consider only logs where label starts with this
    pointsPerMemberFirstVisit: 1,   // points for a member's first visit to a cluster
    pointsPerMemberRepeatVisit: 0,  // points for repeat visits (usually 0)
    awardOnlyFirstVisit: true,      // if true, ignore repeat visits even if above is > 0
    minGroupSize: 1,
    maxGroupSize: 9999,
    minPointsRequired: 3,
    // Per-cluster rule map; keys are normalized uppercase cluster labels
    // { CLUSTER1: { awardPoints: 1, redeemable: true, redeemPoints: 1 }, ... }
    clusterRules: {}
  }
};

let config = JSON.parse(JSON.stringify(defaultConfig));
let persist;
try {
  // Optional persistence; if module missing, ignore silently
  persist = require('./gameLiteConfigStore');
  const loaded = persist.loadSync?.();
  if (loaded && typeof loaded === 'object') {
    config = { ...config, ...loaded, rules: { ...config.rules, ...(loaded.rules || {}) } };
  }
} catch (_) {}

function getConfig() {
  return config;
}

function resetToDefault() {
  config = JSON.parse(JSON.stringify(defaultConfig));
  return config;
}

function updateConfig(partial = {}) {
  // shallow merge at top level and rules
  if (typeof partial.enabled === 'boolean') config.enabled = partial.enabled;
  if (partial.rules && typeof partial.rules === 'object') {
    config.rules = { ...config.rules, ...partial.rules };
  }
  try { persist?.saveSync?.(config); } catch (_) {}
  return config;
}

function setRules(rules = {}) {
  return updateConfig({ rules });
}

function getRule(key, fallback = undefined) {
  return Object.prototype.hasOwnProperty.call(config.rules, key)
    ? config.rules[key]
    : fallback;
}

function normalizeLabel(label) {
  return String(label || '').trim().toUpperCase();
}

function getClusterRule(label) {
  const key = normalizeLabel(label);
  const map = config.rules.clusterRules || {};
  return map[key];
}

module.exports = {
  getConfig,
  updateConfig,
  resetToDefault,
  setRules,
  getRule,
  getClusterRule,
  normalizeLabel,
  defaultConfig
};
