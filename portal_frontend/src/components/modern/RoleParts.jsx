/**
 * Small shared pieces for the IDO / IHOD / AO pages in the modern look (approved 28 Oct 2026).
 * Presentation only: no API calls, no permission decisions.
 */
import {Cell,Pie,PieChart,ResponsiveContainer,Tooltip} from 'recharts';
import {MuRing, MuSkeleton} from './ModernUI.jsx';

/** Donut + legend used on the role dashboards. data: [{name,value,color}] */
export function MuDonutLegend({data,center,centerLabel,loading=false,onOpen}){
  // F: keep the last chart while it refreshes; the ring only on a first load.
  if(loading&&!(data||[]).some(item=>Number(item?.value)>0))return <MuSkeleton kind="donut" label={`Loading ${centerLabel||'chart'}…`}/>;
  const shown=data.filter(item=>item.value>0);
  const total=data.reduce((sum,item)=>sum+(Number(item.value)||0),0);
  return <div className="mu-donut-wrap" role={onOpen?'button':undefined} tabIndex={onOpen?0:undefined} style={onOpen?{cursor:'pointer'}:undefined}
    onClick={onOpen} onKeyDown={e=>{if(onOpen&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen();}}}>
    <div className="mu-donut">{shown.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={shown} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} stroke="#fff" strokeWidth={shown.length>1?2:0}>
      {shown.map(item=><Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<MuRing percent={0} size={136} stroke={18}/>}
      <div className="mu-donut-center"><strong>{loading?'—':center??total}</strong><span>{centerLabel}</span></div></div>
    <div className="mu-legend">{data.map(item=><div key={item.name}><i style={{background:item.color}}/>{item.name}<b>{loading?'—':item.value}</b></div>)}</div>
  </div>;
}

/** "By dataset" mini bars. rows: [{name,value}] */
export function MuByList({title='By dataset',rows,colors=['#0b5bd3','#5b4bd6','#0f7a2f','#e0620a','#a86a00']}){
  if(!rows.length)return null;
  const max=Math.max(1,...rows.map(r=>r.value));
  return <div className="mu-bylist"><h3>{title}</h3>{rows.map((row,i)=><div key={row.name} className="mu-byrow">
    <i style={{background:colors[i%colors.length]}}/><span title={row.name}>{row.name}</span>
    <em><u style={{width:`${row.value/max*100}%`,background:colors[i%colors.length]}}/></em><b>{row.value}</b></div>)}</div>;
}
