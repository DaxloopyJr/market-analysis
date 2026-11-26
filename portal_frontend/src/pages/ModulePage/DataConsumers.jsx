import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search, UsersRound } from 'lucide-react';
import { dataConsumersAPI } from '../../API/dataConsumers';
import { apiError } from '../../API/resourceHelpers';
import Swal from '../../utils/portalAlerts';
import { TableLoader } from '../../components/common/LoadingState';
import './DataConsumers.css';
import InsightModal from '../../components/insights/InsightModal.jsx';

const PAGE_SIZE = 10;
const asText = (value) => (value == null ? '' : String(value));
const normalize = (item) => ({
  id: item.id ?? item.consumerId,
  name: item.name ?? item.consumerName ?? '',
  shortName: item.shortName ?? item.short_name ?? '',
  description: item.description ?? '',
});

function exportCSV(records) {
  const rows = [
    ['Consumer Name', 'Short Name', 'Description'],
    ...records.map((consumer) => [consumer.name, consumer.shortName, consumer.description]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${asText(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'data-consumers.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DataConsumers() {
  const [insight, setInsight] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(null);
  const [serverPage, setServerPage] = useState(1);
  const [serverLastPage, setServerLastPage] = useState(1);
  const [paginated, setPaginated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Confirmed endpoint only: NO search/perPage or unverified write calls.
      const response = await dataConsumersAPI.list();
      setItems(response.items.map(normalize));
      setServerTotal(response.total);
      setServerPage(response.currentPage);
      setServerLastPage(response.lastPage);
      setPaginated(response.paginated);
    } catch (error) {
      setItems([]);
      void Swal.fire({ icon: 'error', title: 'Unable to load Data Consumers', text: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((consumer) => [consumer.name, consumer.shortName, consumer.description]
      .some((value) => asText(value).toLocaleLowerCase().includes(term)));
  }, [items, query]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalLabel = paginated ? `${serverTotal} (server total)` : String(items.length);

  return (
    <section className="dc-page">
      <div className="dc-header">
        <div>
          <h1>Data Consumers</h1>
          <p>Registered data consumers from the dataset master records</p>
        </div>
      </div>
      <div className="dc-stats dc-stats-compact">
        <div className="vi-insight-trigger" role="button" tabIndex={0} aria-haspopup="dialog" onClick={()=>setInsight({title:"Total Consumers",kind:"metric",value:loading?"—":totalLabel,details:[{label:"Records loaded",value:items.length},{label:"Matching current search",value:filtered.length},{label:"Source",value:"Data Consumers master list"}]})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.currentTarget.click()}}}><UsersRound/><span>Total Consumers</span><strong>{loading ? '…' : totalLabel}</strong></div>
      </div>
      <section className="dc-card">
        <div className="dc-card-title">
          <h2>Registered Data Consumers</h2>
          <button className="btn btn-outline-secondary btn-sm" disabled={loading || !filtered.length} onClick={() => exportCSV(filtered)}>
            <Download size={15}/> Export List
          </button>
        </div>
        <div className="dc-toolbar">
          <div className="dc-search">
            <Search size={16}/>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              aria-label="Search consumer name" placeholder="Search consumers in loaded list…"/>
          </div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => { setQuery(''); setPage(1); }}>Reset</button>
        </div>
        <div className="dc-table-region">
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead><tr><th>#</th><th>Consumer Name</th><th>Short Name</th><th>Description</th></tr></thead>
              <tbody>
                {!loading && visible.map((consumer, index) => (
                  <tr key={consumer.id ?? index}>
                    <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="dc-name">{consumer.name}</td>
                    <td>{consumer.shortName || '—'}</td>
                    <td>{consumer.description || '—'}</td>
                  </tr>
                ))}
                {!loading && !visible.length && <tr><td colSpan="4" className="text-center py-4">No consumers found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TableLoader active={loading} label="Loading data consumers…"/>
        </div>
        {!loading && paginated && serverLastPage > 1 && (
          <p className="dc-server-note">Showing records returned by Laravel (server page {serverPage} of {serverLastPage}). Search and export apply to loaded records only.</p>
        )}
        <div className="dc-footer">
          <span>Showing {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} loaded consumers</span>
          <div>
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button disabled={page >= lastPage || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </section>
        <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
  </section>
  );
}
