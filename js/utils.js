import { t } from './i18n.js';
export const $=(id)=>document.getElementById(id);
export function bind(id, fn){ const el=$(id); if(el) el.onclick=fn; }
export function showLoader(show=true){ $('loader')?.classList.toggle('hidden',!show); }
export async function safe(label, fn){ try{showLoader(true); return await fn();}catch(e){console.error(label,e); toast(e.message||String(e),'error');}finally{showLoader(false);} }
export function toast(msg,type='success'){ const root=$('toastRoot'); if(!root) return alert(msg); const div=document.createElement('div'); div.className=`toast ${type}`; div.textContent=msg; root.appendChild(div); setTimeout(()=>div.remove(),4200); }
export function requireFields(fields){ for(const [id,name] of fields){ const el=$(id); if(!el || !String(el.value||'').trim()){ toast(`${t('missing')}: ${name}`, 'error'); el?.focus(); return false; } } return true; }
export function todayISO(){return new Date().toISOString().slice(0,10)}
export function monthKey(d=new Date()){return d.toISOString().slice(0,7)}
export function timeToMinutes(v){ if(!v) return 0; const [h,m]=String(v).split(':').map(Number); return (h||0)*60+(m||0); }
export function minutesBetween(a,b){ return Math.max(0,timeToMinutes(b)-timeToMinutes(a)); }
export function formatHours(min){ const h=Math.floor((min||0)/60), m=Math.round((min||0)%60); return `${h}h ${m}m`; }

export function prettyTime(v){
  if(!v) return '-';
  if(typeof v === 'object'){
    if(v.seconds) return new Date(v.seconds*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    if(v.toDate) return v.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  const s = String(v);
  if(s.includes('Timestamp')){
    const m = s.match(/seconds=(\d+)/);
    if(m) return new Date(Number(m[1])*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return '-';
  }
  if(/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5);
  const d = new Date(s);
  if(!isNaN(d)) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return s;
}
export function money(n){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2}); }
export function download(filename, text, type='text/plain'){ const blob=new Blob([text],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
export function toCsv(rows){ if(!rows.length) return ''; const keys=Object.keys(rows[0]); return [keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\n'); }
export function parseCsv(text){ const lines=text.trim().split(/\r?\n/); const headers=lines.shift().split(',').map(x=>x.trim()); return lines.filter(Boolean).map(line=>{ const cells=line.split(',').map(x=>x.trim().replace(/^"|"$/g,'')); return Object.fromEntries(headers.map((h,i)=>[h,cells[i]||''])); }); }
export function distanceMeters(lat1, lon1, lat2, lon2){ const R=6371000, toRad=x=>x*Math.PI/180; const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
export function currentLocation(){ return new Promise((res,rej)=>{ if(!navigator.geolocation) return rej(new Error(t('gpsDenied'))); navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude}),()=>rej(new Error(t('gpsDenied'))),{enableHighAccuracy:true,timeout:10000}); }); }
export function printHtml(title, html){ const w=window.open('', '_blank'); w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial,Tahoma;padding:28px;color:#111}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ddd;padding:9px;text-align:start}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px}.total{font-size:22px;font-weight:800}.muted{color:#555}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / PDF</button>${html}</body></html>`); w.document.close(); setTimeout(()=>w.print(),400); }
