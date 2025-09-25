import { useEffect, useMemo, useState } from 'react';
import { gameLite } from '../../api';
import { Card, CardBody } from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import Badge from '../../ui/Badge.jsx';
import Table from '../../ui/Table.jsx';
import Modal from '../../ui/Modal.jsx';
import Toast from '../../ui/Toast.jsx';
import Loader from '../../ui/Loader.jsx';

export default function GameLiteAdmin() {
  const [cfg, setCfg] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [draftRule, setDraftRule] = useState({ cluster_label: '', award_points: 0, redeemable: false, redeem_points: 0 });
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemForm, setRedeemForm] = useState({ registration_id: "", cluster_label: "" });
  const [openMenuFor, setOpenMenuFor] = useState(null);

  const load = async () => {
    const [c, e] = await Promise.all([gameLite.getConfig(), gameLite.getEligibleTeams()]);
    setCfg(c);
    setEligible(e);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const rulesArray = useMemo(() => {
    const rules = cfg?.rules?.clusterRules || {};
    return Object.entries(rules).map(([cluster_label, v]) => ({
      cluster_label,
      award_points: v.awardPoints ?? 0,
      redeemable: !!v.redeemable,
      redeem_points: v.redeemPoints ?? 0,
    }));
  }, [cfg]);

  const saveConfig = async (patch) => {
    setSaving(true);
    try {
      const res = await gameLite.setConfig({ rules: patch.rules ? patch.rules : patch, enabled: patch.enabled });
      setCfg(res);
      setToast("Config saved");
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async (arr) => {
    setSaving(true);
    try {
      const res = await gameLite.setClusterRules(arr);
      setCfg(res);
      setToast("Rules updated");
    } finally {
      setSaving(false);
    }
  };

  const addOrUpdateRule = async () => {
    const key = draftRule.cluster_label.trim().toUpperCase();
    if (!key) return;
    const arr = [
      ...rulesArray.filter((r) => r.cluster_label !== key),
      { ...draftRule, cluster_label: key },
    ];
    await saveRules(arr);
    setDraftRule({ cluster_label: '', award_points: 0, redeemable: false, redeem_points: 0 });
  };

  const updateRule = async (idx, patch) => {
    const arr = rulesArray.slice();
    arr[idx] = { ...arr[idx], ...patch };
    await saveRules(arr);
  };

  const removeCluster = async (cluster_label) => {
    const arr = rulesArray.filter(x => x.cluster_label !== cluster_label);
    await saveRules(arr);
    setToast(`Removed ${cluster_label}`);
  };

  const doRedeem = async () => {
    await gameLite.redeem(redeemForm);
    setToast(`Redeemed for team ${redeemForm.registration_id}`);
    setRedeemOpen(false);
    setRedeemForm({ registration_id: "", cluster_label: "" });
    load();
  };

  if (!cfg) return <Loader/>;

  const td = "text-center";
  const eligibleCols = [
    { header: "Reg ID", key: "registration_id", tdClass: td },
    { header: "Group", key: "group_size", tdClass: td },
    { header: "Score", key: "score", tdClass: td },
    { header: "Latest", key: "latest_label", tdClass: td },
    { header: "Last Seen", tdClass: td, render: (r) => r.latest_time ? new Date(r.latest_time).toLocaleString() : "-" },
    { header: "Status", tdClass: td, render: (r) => {
        const ok = (r.score ?? 0) >= (cfg?.rules?.minPointsRequired ?? 0)
          && (r.group_size ?? 0) >= (cfg?.rules?.minGroupSize ?? 0)
          && (r.group_size ?? 0) <= (cfg?.rules?.maxGroupSize ?? 9999);
        return <Badge color={ok?"green":"yellow"}>{ok?"Eligible":"Not eligible"}</Badge>
      }
    },
    { header: "", tdClass: td, render: (r) => (
        <Button size="sm" variant="accent" className="rounded-2xl px-4" onClick={() => { setRedeemForm({ registration_id: r.registration_id, cluster_label: "" }); setRedeemOpen(true); }}>
          Redeem
        </Button>
      )
    }
  ];

  const rulesCols = [
    { header: "Cluster", key: "cluster_label", tdClass: td },
    { header: "Award", tdClass: td, render: (r) => (
        <input type="number" className="w-24 rounded-2xl border border-white/10 bg-black/30 px-3 py-1.5 text-center"
               value={r.award_points}
               onChange={(e) => updateRule(rulesArray.findIndex(x=>x.cluster_label===r.cluster_label), { award_points: Number(e.target.value) })}/>
      )
    },
    { header: "Redeemable", tdClass: td, render: (r) => (
        <input type="checkbox" checked={r.redeemable}
               onChange={(e) => updateRule(rulesArray.findIndex(x=>x.cluster_label===r.cluster_label), { redeemable: e.target.checked })}/>
      )
    },
    { header: "Redeem", tdClass: td, render: (r) => (
        <input type="number" className="w-24 rounded-2xl border border-white/10 bg-black/30 px-3 py-1.5 text-center"
               value={r.redeem_points}
               onChange={(e) => updateRule(rulesArray.findIndex(x=>x.cluster_label===r.cluster_label), { redeem_points: Number(e.target.value) })}/>
      )
    },
    { header: "", tdClass: td, render: (r) => (
      <div className="relative inline-block text-left">
        <button
          className="px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/15"
          onClick={()=> setOpenMenuFor(openMenuFor === r.cluster_label ? null : r.cluster_label)}
          aria-label="More"
        >⋮</button>
        {openMenuFor === r.cluster_label && (
          <div className="absolute right-0 mt-2 w-40 rounded-xl border border-white/10 bg-brand-card shadow-soft z-10">
            <button
              className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl"
              onClick={() => { setOpenMenuFor(null); removeCluster(r.cluster_label); }}
            >Remove cluster</button>
          </div>
        )}
      </div>
    ) }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-xl font-bold">Game Lite — Config</h1>
            {saving && <span className="text-xs text-white/60">Saving…</span>}
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            {/* Game is always enabled — control removed */}
            <label className="md:col-span-2">Label Prefix
              <input className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                     value={cfg.rules?.eligibleLabelPrefix || 'CLUSTER'}
                     onChange={(e)=>saveConfig({ rules: { eligibleLabelPrefix:e.target.value } })}/>
            </label>
            <label>Min group
              <input type="number" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                     value={cfg.rules?.minGroupSize ?? 1} onChange={(e)=>saveConfig({ rules: { minGroupSize:Number(e.target.value) } })}/>
            </label>
            <label>Max group
              <input type="number" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                     value={cfg.rules?.maxGroupSize ?? 9999} onChange={(e)=>saveConfig({ rules: { maxGroupSize:Number(e.target.value) } })}/>
            </label>
            <label>Min points
              <input type="number" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                     value={cfg.rules?.minPointsRequired ?? 0} onChange={(e)=>saveConfig({ rules: { minPointsRequired:Number(e.target.value) } })}/>
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Per-Cluster Rules</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load}>Refresh</Button>
              <Button variant="primary" onClick={addOrUpdateRule}>Add / Update Rule</Button>
            </div>
          </div>
          <div className="mb-2 text-white/70 text-sm">Redeemable clusters will automatically deduct their redeem points on tap.</div>
          <Table columns={rulesCols} rows={rulesArray}/>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input placeholder="CLUSTER1" className="rounded border border-white/10 bg-black/30 p-2"
                   value={draftRule.cluster_label}
                   onChange={(e) => setDraftRule({ ...draftRule, cluster_label: e.target.value.toUpperCase() })} />
            <input type="number" placeholder="Award" className="rounded border border-white/10 bg-black/30 p-2"
                   value={draftRule.award_points}
                   onChange={(e) => setDraftRule({ ...draftRule, award_points: Number(e.target.value) })} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draftRule.redeemable}
                     onChange={(e) => setDraftRule({ ...draftRule, redeemable: e.target.checked })} />
              Redeemable
            </label>
            <input type="number" placeholder="Redeem points" className="rounded border border-white/10 bg-black/30 p-2"
                   value={draftRule.redeem_points}
                   onChange={(e) => setDraftRule({ ...draftRule, redeem_points: Number(e.target.value) })} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Eligible Teams</h2>
            <Button variant="outline" onClick={load}>Refresh</Button>
          </div>
          <Table columns={eligibleCols} rows={eligible} rowKey={(r)=>r.registration_id}/>
        </CardBody>
      </Card>

      <Modal open={redeemOpen} onClose={()=>setRedeemOpen(false)} title="Redeem Points">
        <div className="grid gap-3 md:grid-cols-2">
          <label>Registration ID
            <input className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                   value={redeemForm.registration_id}
                   onChange={(e)=>setRedeemForm({...redeemForm, registration_id: e.target.value})}/>
          </label>
          <label>Cluster
            <select className="mt-1 w-full rounded border border-white/10 bg-black/30 p-1"
                    value={redeemForm.cluster_label}
                    onChange={(e)=>setRedeemForm({...redeemForm, cluster_label: e.target.value})}>
              <option value="">Choose cluster</option>
              {rulesArray.filter(r=>r.redeemable).map(r=> (
                <option key={r.cluster_label} value={r.cluster_label}>
                  {r.cluster_label} (−{r.redeem_points})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={()=>setRedeemOpen(false)}>Cancel</Button>
          <Button variant="accent" onClick={doRedeem}>Redeem</Button>
        </div>
      </Modal>

      <Toast text={toast} show={!!toast} onClose={()=>setToast("")}/>
    </div>
  );
}
