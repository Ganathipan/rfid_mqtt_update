import { useEffect, useMemo, useState } from 'react';
import { api, readerConfig } from '../api';
import { Card, CardBody } from '../ui/Card.jsx';
import Table from '../ui/Table.jsx';

export default function AdminPortal() {
  const [registrations, setRegistrations] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState(''); // '', school, university, general
  const [msg, setMsg] = useState('');
  const [rcList, setRcList] = useState([]);
  const [rcForm, setRcForm] = useState({ r_index: '', reader_id: '', portal: '' });
  const [rcSaving, setRcSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMsg('');
      try {
        const [regs, rfid, rc] = await Promise.all([
          api('/api/tags/admin/registrations'),
          api('/api/tags/list-cards'),
          readerConfig.list(),
        ]);
        setRegistrations(regs || []);
        setCards(rfid || []);
        setRcList(rc || []);
      } catch (e) {
        setMsg(e.message || 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const computed = useMemo(() => {
    const typeOf = (r) => {
      if (r.school) return 'school';
      if (r.university) return 'university';
      return 'general';
    };

    const totalRecords = registrations.length;
    const totalPeople = registrations.reduce((sum, r) => sum + (Number(r.group_size) || 1), 0);
    const byType = registrations.reduce((acc, r) => {
      const t = typeOf(r);
      acc[t] = (acc[t] || 0) + (Number(r.group_size) || 1);
      return acc;
    }, {});

    const totalTags = cards.length;
    const assignedTags = cards.filter(c => String(c.status).toLowerCase() === 'assigned').length;
    const availableTags = cards.filter(c => String(c.status).toLowerCase() === 'available').length;

    return { totalRecords, totalPeople, byType, totalTags, assignedTags, availableTags };
  }, [registrations, cards]);

  const filtered = useMemo(() => {
    if (!filterType) return registrations;
    return registrations.filter(r => {
      if (filterType === 'school') return !!r.school;
      if (filterType === 'university') return !!r.university;
      return !r.school && !r.university; // general
    });
  }, [registrations, filterType]);

  if (loading) {
    return <div className="mut">Loading admin portal…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-xl font-semibold">Game Lite</h2>
            <p className="mb-3 text-white/80">Manage scoring, thresholds, cluster rules, and redemptions.</p>
            {/* Button removed as requested */}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-2 text-xl font-semibold">Kiosks</h2>
            <p className="mb-3 text-white/80">Directory of per-cluster live displays.</p>
            {/* Keep card; no extra button here if you also want this hidden */}
          </CardBody>
        </Card>
      </div>

      {msg && <div className="text-amber-300 text-sm">{msg}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardBody>
          <div className="text-white/70 text-xs">Total Records</div>
          <div className="text-lg font-bold">{computed.totalRecords}</div>
        </CardBody></Card>
        <Card><CardBody>
          <div className="text-white/70 text-xs">Total People</div>
          <div className="text-lg font-bold">{computed.totalPeople}</div>
        </CardBody></Card>
        <Card><CardBody>
          <div className="text-white/70 text-xs">Individuals (general)</div>
          <div className="text-lg font-bold">{computed.byType.general || 0}</div>
        </CardBody></Card>
        <Card><CardBody>
          <div className="text-white/70 text-xs">Batches (school+univ)</div>
          <div className="text-lg font-bold">{(computed.byType.school || 0) + (computed.byType.university || 0)}</div>
        </CardBody></Card>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-white/70 text-sm">Filter by type:</label>
        <select className="rounded border border-white/10 bg-black/30 px-2 py-1" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All</option>
          <option value="school">School</option>
          <option value="university">University</option>
          <option value="general">General</option>
        </select>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-white/90">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">ID</th>
              <th className="px-3 py-2 text-left font-semibold">Portal</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Province</th>
              <th className="px-3 py-2 text-left font-semibold">District</th>
              <th className="px-3 py-2 text-left font-semibold">School/University</th>
              <th className="px-3 py-2 text-left font-semibold">Age</th>
              <th className="px-3 py-2 text-left font-semibold">Sex</th>
              <th className="px-3 py-2 text-left font-semibold">Size</th>
            </tr>
          </thead>
          <tbody className="text-white/90">
            {filtered.map((r, i) => {
              const type = r.school ? 'school' : (r.university ? 'university' : 'general');
              return (
                <tr key={r.id} className="odd:bg-white/0 even:bg-white/[0.03] hover:bg-white/[0.06]">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">#{r.id}</td>
                  <td className="px-3 py-2">{r.portal}</td>
                  <td className="px-3 py-2">{type}</td>
                  <td className="px-3 py-2">{r.province || '-'}</td>
                  <td className="px-3 py-2">{r.district || '-'}</td>
                  <td className="px-3 py-2">{r.school || r.university || '-'}</td>
                  <td className="px-3 py-2">{r.age_range || '-'}</td>
                  <td className="px-3 py-2">{r.sex || '-'}</td>
                  <td className="px-3 py-2">{r.group_size}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reader Config Management */}
      <Card>
        <CardBody>
          <h2 className="mb-2 text-xl font-semibold">Reader Configuration</h2>
          <p className="mb-3 text-white/80">Map device indexes (rIndex) to readerID and portal. Devices fetch this at boot.</p>
          <div className="grid gap-2 md:grid-cols-4 items-end mb-3">
            <div>
              <label className="text-white/70 text-sm">rIndex</label>
              <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
                     type="number" min="0" value={rcForm.r_index}
                     onChange={(e)=>setRcForm(f=>({ ...f, r_index: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/70 text-sm">readerID</label>
              <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
                     value={rcForm.reader_id}
                     onChange={(e)=>setRcForm(f=>({ ...f, reader_id: e.target.value }))}
                     placeholder="e.g., REGISTER or CLUSTER1" />
            </div>
            <div>
              <label className="text-white/70 text-sm">portal</label>
              <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
                     value={rcForm.portal}
                     onChange={(e)=>setRcForm(f=>({ ...f, portal: e.target.value }))}
                     placeholder="e.g., portal1 or reader1" />
            </div>
            <div>
              <button className="btn" disabled={rcSaving}
                      onClick={async ()=>{
                        const idx = Number(rcForm.r_index);
                        if (!Number.isInteger(idx) || idx < 0) { setMsg('rIndex must be a non-negative integer'); return; }
                        const rid = String(rcForm.reader_id||'').trim();
                        const p = String(rcForm.portal||'').trim();
                        if (!rid || !p) { setMsg('readerID and portal are required'); return; }
                        setRcSaving(true);
                        try {
                          await readerConfig.upsert({ r_index: idx, reader_id: rid, portal: p });
                          const rc = await readerConfig.list();
                          setRcList(rc||[]);
                          setRcForm({ r_index: '', reader_id: '', portal: '' });
                        } catch (e) {
                          setMsg(e.message || 'Failed to save config');
                        } finally {
                          setRcSaving(false);
                        }
                      }}>Save</button>
            </div>
          </div>

          <Table columns={[
            { header: 'rIndex', key: 'r_index' },
            { header: 'readerID', key: 'reader_id', tdClass: 'font-mono' },
            { header: 'portal', key: 'portal', tdClass: 'font-mono' },
            { header: 'updated', key: 'updated_at' },
            { header: 'actions', render: (r)=> (
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={()=> setRcForm({ r_index: r.r_index, reader_id: r.reader_id, portal: r.portal })}>Edit</button>
                <button className="btn btn-sm bg-red-600 hover:bg-red-500" onClick={async ()=>{
                  try {
                    await readerConfig.remove(r.r_index);
                    const rc = await readerConfig.list();
                    setRcList(rc||[]);
                  } catch (e) { setMsg(e.message || 'Failed to delete'); }
                }}>Delete</button>
              </div>
            )}
          ]}
          rows={rcList}
          rowKey={(r)=>r.r_index}
          />
        </CardBody>
      </Card>
    </div>
  );
}
