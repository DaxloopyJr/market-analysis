import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import './InsightModal.css';
import { chartDetails } from '../../utils/chartDetails.js';

const colorSet = ['#1876d2', '#12a06d', '#f18b2c', '#8758d3', '#13a7b1'];
const numberOf = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : (value ?? '—');

/** Use exactly the figures already calculated by the calling dashboard. No extra API. */
export function insightRows(data = [], keys = []) {
  return keys.map((entry) => ({
    label: entry.label ?? entry.key,
    value: data.reduce((sum, item) => sum + (Number(item?.[entry.key]) || 0), 0),
  }));
}

function InsightVisual({ insight }) {
  const data = Array.isArray(insight?.data) ? insight.data : [];
  const series = Array.isArray(insight?.series) ? insight.series : [];
  const total = data.reduce((acc, item) => acc + Number(item?.value || 0), 0);
  if (insight?.kind === 'metric') return (
    <div className="vi-insight-big-number">
      <strong>{numberOf(insight.value)}</strong><span>{insight.unit || insight.title}</span>
    </div>
  );
  if (!data.length) return <p className="vi-insight-no-data">No verified data available for this selection.</p>;
  if (insight.kind === 'line') return (
    <div className="vi-insight-expanded-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{top:12,right:16,bottom:8,left:-9}}>
          <CartesianGrid stroke="#e6ebf2" vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={insight.xKey || 'name'} tick={{fontSize:11}} />
          <YAxis tick={{fontSize:11}} />
          <Tooltip /><Legend wrapperStyle={{fontSize:11}} />
          {(series.length ? series : [{key:'value',label:'Value'}]).map((item,i)=>(
            <Line key={item.key} type="monotone" dataKey={item.key} name={item.label||item.key}
              stroke={item.color||colorSet[i%colorSet.length]} strokeWidth={2.4} dot={{r:2.5}} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
  if (insight.kind === 'donut') return (
    <div className="vi-insight-expanded-chart vi-insight-pie">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="82%" strokeWidth={0}>
          {data.map((entry, i) => <Cell key={String(entry.name ?? i)} fill={insight.colors?.[i] || colorSet[i % colorSet.length]} />)}
        </Pie><Tooltip formatter={(value) => numberOf(value)} /></PieChart>
      </ResponsiveContainer>
      <div className="vi-insight-center" aria-label={`Total ${total}`}>
        <strong>{numberOf(total)}</strong><span>Total</span>
      </div>
    </div>
  );
  return (
    <div className="vi-insight-expanded-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 15, bottom: 8, left: -12 }}>
          <CartesianGrid stroke="#e6ebf2" vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={insight.xKey || 'name'} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((item, i) => <Bar key={item.key} dataKey={item.key} name={item.label || item.key} fill={item.color || colorSet[i % colorSet.length]} maxBarSize={46} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function InsightModal({ insight, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => {
    if (!insight) return undefined;
    const previous = document.activeElement;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus?.(); };
  }, [insight, onClose]);
  if (!insight) return null;
  const details = Array.isArray(insight.details) ? insight.details : [];
  const given = new Set(details.map((entry) => String(entry.label).toLowerCase()));
  const breakdown = chartDetails(insight).filter((entry) => !given.has(String(entry.label).toLowerCase()));
  return createPortal(
    <div className="vi-insight-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="vi-insight-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="vi-insight-header">
          <h2 id={titleId}>{insight.title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details"><X size={21} /></button>
        </header>
        <div className="vi-insight-content">
          <div className="vi-insight-visual"><InsightVisual insight={insight} /></div>
          <aside className="vi-insight-details" aria-label="Key details">
            <h3>Key Details</h3>
            {breakdown.concat(details).length ? (
              <dl>{breakdown.concat(details).map((entry, i) => (
                <div key={`${entry.label}-${i}`}><dt>{entry.label}</dt><dd>{numberOf(entry.value)}</dd></div>
              ))}</dl>
            ) : <p>No additional verified breakdown is available.</p>}
          </aside>
        </div>
        <footer className="vi-insight-footer"><button type="button" onClick={onClose}>Close</button></footer>
      </section>
    </div>, document.body
  );
}
