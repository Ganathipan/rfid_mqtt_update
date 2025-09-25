const API_BASE = import.meta.env.VITE_API_BASE || '';
const ADMIN_KEY = import.meta.env.VITE_GAMELITE_KEY || '';

export async function api(path, opts = {}) {
  const url = (() => {
    if (path.startsWith('http')) return path;
    // If path starts with '/api', rely on Vite proxy; don't prefix with API_BASE
    if (path.startsWith('/api')) return path;
    const base = API_BASE || '';
    return `${base}${path.startsWith('/') ? path : '/' + path}`;
  })();
  const res = await fetch(url, { // Update API endpoints and payloads to match backend changes for new schema
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function getStatus(rfid) {
  return api(`/tags/status/${rfid}`);
}

// -------------- Game Lite client --------------
async function apiGet(path, extraHeaders = {}) {
  return api(path, { method: 'GET', headers: extraHeaders });
}

async function apiPost(path, body, extraHeaders = {}) {
  return api(path, { method: 'POST', headers: extraHeaders, body });
}

export const gameLite = {
  // public
  status: () => apiGet('/api/game-lite/status'),
  getConfig: () => apiGet('/api/game-lite/config'),
  getEligibleTeams: () => apiGet('/api/game-lite/eligible-teams'),
  getLeaderboard: (limit = 10) => apiGet(`/api/game-lite/leaderboard?limit=${encodeURIComponent(limit)}`),

  // admin (requires x-admin-key header)
  setConfig: (patch) => apiPost('/api/game-lite/config', patch, ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {}),
  resetConfig: () => apiPost('/api/game-lite/config/reset', {}, ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {}),
  initLiteTables: () => apiPost('/api/game-lite/admin/init', {}, ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {}),
  redeem: ({ registration_id, cluster_label }) => {
    const body = {
      registrationId: Number(registration_id),
      clusterLabel: String(cluster_label || '').toUpperCase(),
    };
    const headers = ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {};
    return apiPost('/api/game-lite/redeem', body, headers);
  },

  // helpers to update cluster rules map
  async setClusterRules(rulesArray) {
    // rulesArray: [{ cluster_label, award_points, redeemable, redeem_points }]
    const map = {};
    for (const r of (rulesArray || [])) {
      const key = String(r.cluster_label || '').trim().toUpperCase();
      if (!key) continue;
      map[key] = {
        awardPoints: Number(r.award_points || 0),
        redeemable: !!r.redeemable,
        redeemPoints: Number(r.redeem_points || 0)
      };
    }
    return apiPost('/api/game-lite/config', { rules: { clusterRules: map } }, ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {});
  }
};

// -------------- Reader Config client --------------
export const readerConfig = {
  list: () => api('/api/reader-config', { method: 'GET' }),
  get: (rIndex) => api(`/api/reader-config/${encodeURIComponent(rIndex)}`, { method: 'GET' }),
  upsert: ({ r_index, reader_id, portal }) => api('/api/reader-config', { method: 'POST', body: { r_index, reader_id, portal } }),
  update: (rIndex, patch) => api(`/api/reader-config/${encodeURIComponent(rIndex)}`, { method: 'PUT', body: patch }),
  remove: (rIndex) => api(`/api/reader-config/${encodeURIComponent(rIndex)}`, { method: 'DELETE' })
};

