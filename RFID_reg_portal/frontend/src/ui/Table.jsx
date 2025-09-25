export default function Table({ columns = [], rows = [], rowKey = (r,i)=>i }) {
  return (
    <div className="overflow-auto rounded-3xl border border-white/10 bg-brand-card/70 mx-auto max-w-5xl">
      <table className="min-w-full text-sm">
        <thead className="bg-white/5 text-white/90 text-center">
          <tr>
            {columns.map(c => (
              <th key={c.key ?? c.header} className="px-3 py-2 text-left font-semibold">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-white/90">
          {rows.map((r,i) => (
            <tr key={rowKey(r,i)} className="odd:bg-white/0 even:bg-white/[0.03] hover:bg-white/[0.06]">
              {columns.map(c => (
                <td key={c.key ?? c.header} className={`px-3 py-2 align-middle ${c.tdClass ?? ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
