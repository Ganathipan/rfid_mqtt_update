import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Card, CardBody, CardHeader } from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';

export default function ClusterDirectory() {
  const [clusters, setClusters] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/kiosk/clusters')
      .then((d) => setClusters(d.clusters || []))
      .catch((e) => setErr(e.message || 'Failed to load clusters'));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Cluster Directory</h2>
      {err && <div className="text-rose-300 text-sm">{err}</div>}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {clusters.map((c) => (
          <Card key={c}>
            <CardBody className="flex flex-col gap-2">
              <div className="font-semibold text-white/90">{c}</div>
              <Link to={`/kiosk/cluster/${encodeURIComponent(c)}`} className="w-full">
                <Button className="w-full" variant="outline">Open display</Button>
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
