import { auth, firebaseConfig, COMPANY_ID } from '../firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { $, bind, safe, toast, requireFields, todayISO, formatHours, money, download, toCsv, parseCsv, currentLocation, distanceMeters, printHtml, prettyTime } from './utils.js';
import { applyLang, toggleLang, t } from './i18n.js';
import { state, clearSubs } from './state.js';
import * as api from './db.js';
import { syncOfflineQueue, queueCount } from './db.js';
import { calcPayroll, calcDay, employeeShift, periodRange } from './payroll.js';

const days = ['sat','sun','mon','tue','wed','thu','fri'];
const dayLabels = {ar:['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'], en:['Sat','Sun','Mon','Tue','Wed','Thu','Fri']};
let deferredPrompt=null;

function isAdmin(){ return state.role==='admin' || state.role==='hr' || state.role==='accountant'; }
function isEmployee(){ return state.role==='employee'; }
function setTheme(mode){ document.body.classList.toggle('dark', mode==='dark'); localStorage.setItem('hr_theme',mode); }
function toggleTheme(){ setTheme(document.body.classList.contains('dark')?'light':'dark'); }

function startRealtime(){
  clearSubs();
  state.unsub.push(api.listenUserDoc(state.user.uid, p=>{ state.profile=p; state.role=p?.role||'employee'; renderRole(); }));
  ['employees','shifts','attendance','requests','transactions'].forEach(name=>{
    state.unsub.push(api.listenCollection(name, rows=>{ state[name]=rows; renderAll(); }));
  });
  state.unsub.push(api.listenCollection('settings', rows=>{ state.settings={...state.settings,...(rows[0]||{})}; fillSettings(); renderAll(); }));
}

function renderRole(){
  $('loginView')?.classList.add('hidden'); $('appView')?.classList.remove('hidden');
  $('userLine').textContent = `${state.profile?.name||state.user?.email||''} • ${state.role||''}`;
  $('adminNav')?.classList.toggle('hidden', !isAdmin());
  document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden', !isAdmin() || x.id!=='dashboard'));
  $('employeePortal')?.classList.toggle('hidden', !isEmployee());
  if(isEmployee()) showSection('employeePortal'); else showSection('dashboard');
  renderAll();
}
function showSection(id){
  document.querySelectorAll('.section.admin-only').forEach(s=>s.classList.add('hidden'));
  if(id==='employeePortal'){ $('employeePortal')?.classList.remove('hidden'); return; }
  $('employeePortal')?.classList.add('hidden'); $(id)?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.section===id));
}

function renderAll(){ renderStats(); renderEmployees(); renderShifts(); renderAttendance(); renderRequests(); renderPayroll(); renderEmployeePortal(); fillEmployeeSelects(); }
function renderStats(){
  if(!$('statEmployees')) return;
  $('statEmployees').textContent=state.employees.filter(e=>e.active!==false).length;
  const today=todayISO(); const present=new Set(state.attendance.filter(a=>a.date===today && String(a.type).toUpperCase()==='IN').map(a=>a.uid));
  const out=new Set(state.attendance.filter(a=>a.date===today && String(a.type).toUpperCase()==='OUT').map(a=>a.uid));
  $('statPresent').textContent=[...present].filter(uid=>!out.has(uid)).length;
  $('statRequests').textContent=state.requests.filter(r=>r.status==='pending').length;
  const total=state.employees.reduce((s,e)=>s+calcPayroll(e,state.shifts,state.attendance,state.transactions,'monthly',today).net,0); $('statPayroll').textContent=money(total);
}
function findEmployeeByRequest(r){ return state.employees.find(e=>
  String(e.uid||'')===String(r?.uid||'') ||
  String(e.docId||'')===String(r?.employeeDocId||'') ||
  String(e.employeeId||'')===String(r?.employeeId||'') ||
  String(e.email||'')===String(r?.email||'')
) || null; }
function employeeName(uid){ const e=state.employees.find(x=>x.uid===uid||x.docId===uid); return e?`${e.name} (${e.employeeId||e.code||e.docId})`:uid; }
function requestTypeLabel(type){ const m={advance:t('advance'),deduction:t('deduction'),bonus:t('bonus'),overtime:t('overtime'),absence:t('absenceDeduction'),leave:t('leave'),permission:t('permission'),adjustment:t('adjustment')}; return m[type]||type||'-'; }
function requestToTransactionType(type){ const tpe=String(type||'').toLowerCase(); if(['advance','salary_advance','سلفة','مسحوب'].includes(tpe)) return 'advance'; if(['deduction','خصم'].includes(tpe)) return 'deduction'; if(['bonus','incentive','حافز','اضافة','إضافة'].includes(tpe)) return 'bonus'; if(['overtime','اوفر تايم','أوفر تايم'].includes(tpe)) return 'bonus'; if(['absence','غياب'].includes(tpe)) return 'absence'; if(['adjustment','تسوية'].includes(tpe)) return 'adjustment'; return ''; }
function txSign(type){ return ['advance','deduction','absence'].includes(type) ? '-' : '+'; }
function renderEmployees(){
  const root=$('employeesList'); if(!root) return; const q=($('employeeSearch')?.value||'').toLowerCase();
  const rows=state.employees.filter(e=>[e.name,e.email,e.employeeId,e.fingerprintId].join(' ').toLowerCase().includes(q));
  root.innerHTML = rows.map(e=>`<div class="card">
    <h3>${e.name||'-'}</h3><p><b>${t('employeeId')}:</b> ${e.employeeId||e.code||'-'}</p><p><b>${t('email')}:</b> ${e.email||'-'}</p><p><b>${t('job')}:</b> ${e.job||'-'} • ${e.department||''}</p><p><b>${t('salary')}:</b> ${money(e.salary)}</p><p><b>${t('shift')}:</b> ${(employeeShift(e,state.shifts)?.name)||'-'}</p><p><span class="status ${e.active===false?'off':'present'}">${e.active===false?t('suspended'):t('active')}</span></p>
    <div class="card-actions"><button class="diamond" data-act="editEmp" data-id="${e.docId}">${t('edit')}</button><button class="diamond warning" data-act="toggleEmp" data-id="${e.docId}">${e.active===false?t('activate'):t('stop')}</button><button class="diamond" data-act="printEmp" data-id="${e.docId}">${t('print')}</button><button class="diamond danger" data-act="deleteEmp" data-id="${e.docId}">${t('delete')}</button></div>
  </div>`).join('') || `<div class="card">${t('noData')}</div>`;
}
function fillEmployeeSelects(){ const sel=$('empShift'); if(sel){ sel.innerHTML=`<option value="">-</option>`+state.shifts.map(s=>`<option value="${s.docId}">${s.name}</option>`).join(''); } const tx=$('txEmployee'); if(tx){ tx.innerHTML=`<option value="">-</option>`+state.employees.filter(e=>e.active!==false).map(e=>`<option value="${e.docId}">${e.name} - ${e.employeeId||''}</option>`).join(''); } }
async function openEmployee(id){
  const e=id?state.employees.find(x=>x.docId===id):null; $('empDocId').value=e?.docId||''; $('empCode').value=e?.employeeId||await api.nextEmployeeCode(); $('empName').value=e?.name||''; $('empEmail').value=e?.email||''; $('empPassword').value=''; $('empPhone').value=e?.phone||''; $('empJob').value=e?.job||''; $('empDepartment').value=e?.department||''; $('empSalary').value=e?.salary||''; $('empDailyHours').value=e?.dailyHours||8; $('empHourRate').value=e?.hourRate||''; $('empFingerprintId').value=e?.fingerprintId||''; $('empShift').value=e?.shiftId||''; $('empActive').value=String(e?.active!==false); $('employeeDialog').showModal(); }
async function saveEmployeeForm(ev){ ev?.preventDefault(); if(!requireFields([['empName',t('name')],['empEmail',t('email')],['empSalary',t('salary')]])) return; await safe('save employee', async()=>{
  let uid = state.employees.find(e=>e.docId===$('empDocId').value)?.uid || null;
  if(!$('empDocId').value && $('empPassword').value){ const secondary=initializeApp(firebaseConfig,'secondary-'+Date.now()); const secondaryAuth=getAuth(secondary); const cred=await createUserWithEmailAndPassword(secondaryAuth,$('empEmail').value,$('empPassword').value); uid=cred.user.uid; await signOut(secondaryAuth); await api.createUserProfile(uid,{name:$('empName').value,email:$('empEmail').value,role:'employee',active:true}); }
  const data={uid:uid||$('empDocId').value||$('empEmail').value,employeeId:$('empCode').value,name:$('empName').value,email:$('empEmail').value,phone:$('empPhone').value,job:$('empJob').value,department:$('empDepartment').value,salary:Number($('empSalary').value||0),dailyHours:Number($('empDailyHours').value||8),hourRate:Number($('empHourRate').value||0),fingerprintId:$('empFingerprintId').value,shiftId:$('empShift').value,active:$('empActive').value==='true'};
  const docId=await api.saveEmployee(data,$('empDocId').value||null); if(uid) await api.createUserProfile(uid,{employeeDocId:docId,employeeId:data.employeeId,name:data.name,email:data.email,role:'employee',active:data.active}); $('employeeDialog').close(); toast(t('saved'));
}); }

function renderShifts(){ const root=$('shiftsList'); if(!root) return; root.innerHTML=state.shifts.map(s=>`<div class="card"><h3>${s.name}</h3><p>${t('startTime')}: ${s.start}</p><p>${t('endTime')}: ${s.end}</p><p>${t('graceMinutes')}: ${s.grace}</p><p>${t('workDays')}: ${(s.days||[]).join(', ')}</p><div class="card-actions"><button class="diamond" data-act="editShift" data-id="${s.docId}">${t('edit')}</button><button class="diamond danger" data-act="deleteShift" data-id="${s.docId}">${t('delete')}</button></div></div>`).join('') || `<div class="card">${t('noData')}</div>`; }
function openShift(id){ const s=id?state.shifts.find(x=>x.docId===id):null; $('shiftDocId').value=s?.docId||''; $('shiftName').value=s?.name||''; $('shiftStart').value=s?.start||''; $('shiftEnd').value=s?.end||''; $('shiftGrace').value=s?.grace||15; $('shiftOverAfter').value=s?.overtimeAfter||8; renderShiftDays(s?.days||['sun','mon','tue','wed','thu']); $('shiftDialog').showModal(); }
function renderShiftDays(selected=[]){ const lang=document.documentElement.lang||'ar'; $('shiftDays').innerHTML=days.map((d,i)=>`<label><input type="checkbox" value="${d}" ${selected.includes(d)?'checked':''}> ${dayLabels[lang][i]}</label>`).join(''); }
async function saveShiftForm(ev){ ev?.preventDefault(); if(!requireFields([['shiftName',t('shiftName')],['shiftStart',t('startTime')],['shiftEnd',t('endTime')]])) return; await safe('save shift', async()=>{ const selected=[...$('shiftDays').querySelectorAll('input:checked')].map(i=>i.value); const data={name:$('shiftName').value,start:$('shiftStart').value,end:$('shiftEnd').value,grace:Number($('shiftGrace').value||0),overtimeAfter:Number($('shiftOverAfter').value||8),dailyHours:Number($('shiftOverAfter').value||8),days:selected}; const savedId=await api.saveShift(data, $('shiftDocId').value||null); const local={docId:savedId,...data,companyId:'main'}; state.shifts = state.shifts.some(x=>x.docId===savedId) ? state.shifts.map(x=>x.docId===savedId?{...x,...local}:x) : [...state.shifts, local]; fillEmployeeSelects(); renderShifts(); $('shiftDialog').close(); toast(t('saved')); }); }

function renderAttendance(){ const root=$('attendanceList'); if(!root) return; const q=($('attendanceSearch')?.value||'').toLowerCase(); const date=$('attendanceDate')?.value||todayISO(); const emps=state.employees.filter(e=>[e.name,e.employeeId,e.email].join(' ').toLowerCase().includes(q)); const rows=emps.map(e=>{ const shift=employeeShift(e,state.shifts); const d=calcDay(e,shift,state.attendance,date); return `<tr><td>${e.employeeId||''}</td><td>${e.name}</td><td><span class="status ${d.status==='present'?'present':d.status==='done'?'done':'off'}">${d.status==='present'?t('present'):d.status==='done'?t('finished'):t('notCheckedIn')}</span></td><td>${d.in||'-'}</td><td>${d.out||'-'}</td><td>${formatHours(d.workedMin)}</td><td>${formatHours(d.lateMin)}</td><td>${formatHours(d.overtimeMin)}</td></tr>`; }).join(''); root.innerHTML=`<table class="data-table"><thead><tr><th>ID</th><th>${t('name')}</th><th>${t('status')}</th><th>IN</th><th>OUT</th><th>${t('hours')}</th><th>${t('late')}</th><th>${t('overtime')}</th></tr></thead><tbody>${rows}</tbody></table>`; }
async function check(type){ await safe('attendance', async()=>{ const uid=state.user.uid; let geo=null; if(state.settings.gpsEnabled==='true'||state.settings.gpsEnabled===true){ const loc=await currentLocation(); const dist=distanceMeters(loc.lat,loc.lng,Number(state.settings.lat),Number(state.settings.lng)); if(dist>Number(state.settings.radius||150)) throw new Error(t('outsideRange')); geo={...loc, distance:dist}; }
  const emp=state.employees.find(e=>e.uid===uid || e.docId===state.profile?.employeeDocId) || state.profile || {}; const now=new Date(); const data={uid, employeeDocId:emp.docId||state.profile?.employeeDocId||'', employeeId:emp.employeeId||state.profile?.employeeId||'', employeeName:emp.name||state.profile?.name||state.user.email, email:emp.email||state.user.email, date:todayISO(), time:now.toTimeString().slice(0,5), type, source:'web', geo}; await api.addAttendance(data); state.attendance=[...state.attendance,{docId:'local-'+Date.now(),...data}]; renderAttendance(); renderEmployeePortal(); renderStats(); toast(type==='IN'?t('checkIn'):t('checkOut')); }); }
function renderEmployeePortal(){ if(!isEmployee()) return; const emp=state.employees.find(e=>e.uid===state.user.uid || e.docId===state.profile?.employeeDocId) || state.profile || {}; const d=calcDay(emp,employeeShift(emp,state.shifts),state.attendance,todayISO()); const box=$('liveStatus'); if(box){ box.className=`live-status ${d.status==='present'?'present':d.status==='done'?'done':'off'}`; box.querySelector('strong').textContent=d.status==='present'?t('present'):d.status==='done'?t('finished'):t('notCheckedIn'); }
  if($('statusDetails')) $('statusDetails').innerHTML=`${t('hours')}: ${formatHours(d.workedMin)} • IN: ${d.in||'-'} • OUT: ${d.out||'-'}`;
  const my=state.requests.filter(r=>r.uid===state.user.uid); $('myRequestsList')&&( $('myRequestsList').innerHTML=my.map(r=>`<div class="list-item"><b>${requestTypeLabel(r.type)}</b> ${r.amount?money(r.amount):''} - ${r.status}<br><small>${r.employeeName||''} ${r.employeeId?`• ${r.employeeId}`:''}</small><br>${r.note||''}</div>`).join('') ); }

function renderRequests(){
  const root = $('requestsList');
  if(!root) return;

  const q = ($('requestsSearch')?.value || '').toLowerCase();

  const filtered = state.requests.filter(r => {
    const emp = findEmployeeByRequest(r);
    return [
      r.employeeName,
      r.employeeId,
      r.type,
      r.status,
      r.note,
      emp?.name,
      emp?.employeeId,
      emp?.email
    ].join(' ').toLowerCase().includes(q);
  });

  const groups = {};
  filtered.forEach(r => {
    const emp = findEmployeeByRequest(r);
    const name = r.employeeName || emp?.name || employeeName(r.uid) || '-';
    const code = r.employeeId || emp?.employeeId || '-';
    const key = emp?.docId || r.employeeDocId || r.uid || code || name;
    if(!groups[key]) groups[key] = { name, code, items: [] };
    groups[key].items.push(r);
  });

  const cards = Object.entries(groups).map(([key, group], index) => {
    const bodyId = `requestGroup_${index}`;
    const pending = group.items.filter(x => x.status === 'pending').length;
    const approved = group.items.filter(x => x.status === 'approved').length;
    const rejected = group.items.filter(x => x.status === 'rejected').length;

    const items = group.items.map(r => {
      const txType = requestToTransactionType(r.type);
      const effect = Number(r.amount || 0) > 0 && txType
        ? `<p class="effect ${txSign(txType)==='-'?'minus':'plus'}"><b>${txSign(txType)==='-'?t('willDeduct'):t('willAdd')}:</b> ${money(r.amount)}</p>`
        : '';

      return `<div class="request-item">
        <div class="request-item-head">
          <b>${requestTypeLabel(r.type)}</b>
          <span>${r.amount ? money(r.amount) : ''}</span>
          <small>${r.date || '-'}</small>
          <span class="status ${r.status==='pending'?'pending':r.status==='approved'?'present':'off'}">${r.status || '-'}</span>
        </div>
        <div class="request-item-body">
          ${effect}
          ${r.note ? `<p><b>${t('note')}:</b> ${r.note}</p>` : ''}
          <div class="card-actions">
            ${r.status === 'pending'
              ? `<button class="diamond success" data-act="approveReq" data-id="${r.docId}">${t('accept')}</button>
                 <button class="diamond danger" data-act="rejectReq" data-id="${r.docId}">${t('reject')}</button>`
              : ''
            }
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="card request-employee-card">
      <div class="request-employee-head">
        <div>
          <h3>👤 ${group.name}</h3>
          <p><b>🆔 ${t('employeeId')}:</b> ${group.code}</p>
          <p class="muted">${t('requests')}: ${group.items.length} • ${t('pendingRequests')}: ${pending} • ${t('approved')}: ${approved} • ${t('rejected')}: ${rejected}</p>
        </div>
        <button class="diamond mini-toggle" data-act="toggleRequests" data-target="${bodyId}">${t('showDetails')}</button>
      </div>
      <div id="${bodyId}" class="request-group-body hidden">
        ${items}
      </div>
    </div>`;
  }).join('');

  root.innerHTML = cards || `<div class="card">${t('noData')}</div>`;
}

async function approveRequest(id,status){ await safe('request', async()=>{ const r=state.requests.find(x=>x.docId===id); if(!r) throw new Error(t('noData')); const emp=findEmployeeByRequest(r); const txType=requestToTransactionType(r.type); if(status==='approved' && txType && Number(r.amount)>0){ const exists=state.transactions.some(x=>x.sourceRequestId===id); if(!exists){ const txData={
      uid:r.uid||emp?.uid||emp?.docId||'',
      employeeDocId:emp?.docId||r.employeeDocId||'',
      employeeName:r.employeeName||emp?.name||'',
      employeeId:r.employeeId||emp?.employeeId||'',
      email:r.email||emp?.email||'',
      type:txType,
      amount:Number(r.amount),
      date:r.date||todayISO(),
      note:r.note||t('sourceRequest'),
      source:'request',
      sourceRequestId:id
    };
    await api.addTransaction(txData);
    state.transactions=[...state.transactions,{docId:'local-'+Date.now(),...txData}];
  } }
  await api.updateRequest(id,status); state.requests=state.requests.map(x=>x.docId===id?{...x,status}:x); renderPayroll(); renderRequests(); toast(status==='approved'?t('approved'):t('rejected')); }); }
async function sendMyRequest(){ await safe('send request', async()=>{ const emp=state.employees.find(e=>e.uid===state.user.uid || e.docId===state.profile?.employeeDocId) || state.profile || {}; await api.addRequest({uid:state.user.uid,employeeDocId:emp.docId||state.profile?.employeeDocId||'',employeeName:emp.name||state.profile?.name||state.user.email,employeeId:emp.employeeId||state.profile?.employeeId||'',type:$('empReqType').value,amount:Number($('empReqAmount').value||0),note:$('empReqNote').value,date:todayISO()}); $('empReqAmount').value=''; $('empReqNote').value=''; toast(t('saved')); }); }

function openTransaction(empDocId=''){ const emp=state.employees.find(e=>e.docId===empDocId); $('txEmployee').value=empDocId||''; $('txEmployeeDocId').value=empDocId||''; $('txType').value='advance'; $('txAmount').value=''; $('txDate').value=todayISO(); if($('txScope')) $('txScope').value=selectedPayrollMode(); $('txInstallments').value=1; $('txNote').value=''; $('transactionDialog').showModal(); }
function addMonths(dateStr, n){ const d=new Date(dateStr+'T00:00:00'); d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); }
async function saveTransactionForm(ev){ ev?.preventDefault(); if(!requireFields([['txEmployee',t('employee')],['txAmount',t('amount')],['txDate',t('date')]])) return; await safe('payroll transaction', async()=>{ const emp=state.employees.find(e=>e.docId===$('txEmployee').value); if(!emp) throw new Error(t('noData')); const total=Number($('txAmount').value||0); if(total<=0) throw new Error(t('fillRequired')); const count=Math.max(1,Number($('txInstallments').value||1)); const each=Math.round((total/count)*100)/100; const created=[]; for(let i=0;i<count;i++){ const txData={uid:emp.uid||emp.docId,employeeDocId:emp.docId,employeeName:emp.name||'',employeeId:emp.employeeId||'',email:emp.email||'',type:$('txType').value,amount:each,date:addMonths($('txDate').value,i),note:$('txNote').value,source:'manual',installmentIndex:i+1,installments:count,totalAmount:total}; await api.addTransaction(txData); created.push({docId:'local-'+Date.now()+'-'+i,...txData}); } state.transactions=[...state.transactions,...created]; $('transactionDialog').close(); renderPayroll(); toast(t('saved')); }); }

function txLabel(type){ const m={advance:t('advance'),deduction:t('deduction'),bonus:t('bonus'),absence:t('absenceDeduction'),adjustment:t('adjustment'),salary_payment:t('salaryPayment')}; return m[type]||type||'-'; }
function selectedPayrollMode(){ return $('payrollPeriod')?.value||'monthly'; }
function selectedPayrollDate(){ return $('payrollDate')?.value||todayISO(); }
function payrollForEmployee(emp, mode=selectedPayrollMode(), date=selectedPayrollDate()){ return calcPayroll(emp,state.shifts,state.attendance,state.transactions,mode,date); }
function updatePaymentPreview(){
  const emp = state.employees.find(e => e.docId === $('payEmployeeDocId')?.value);
  if(!emp) return;
  const mode = $('payMode')?.value || selectedPayrollMode();
  const date = $('payDate')?.value || todayISO();
  const p = payrollForEmployee(emp, mode, date);
  const amount = Number($('payAmount')?.value || 0);
  const remaining = Math.max(0, Number(p.net || 0) - amount);

  if($('payCurrentNet')) $('payCurrentNet').value = money(p.net);
  if($('payRemaining')) $('payRemaining').value = money(remaining);

  if($('paymentPreview')){
    $('paymentPreview').innerHTML = `
      <div class="settlement-box">
        <b>${emp.name} ${emp.employeeId || ''}</b><br>
        ${t('paymentMode')}: ${t(mode)}<br>
        ${t('workedHours')}: ${Number(p.workedHours || 0).toFixed(2)} • ${t('hourRate')}: ${money(p.hourRate)}<br>
        ${t('gross')}: ${money(p.base)}
        • ${t('advances')}: -${money(p.advances)}
        • ${t('deductions')}: -${money(p.deductions)}
        • ${t('payments')}: -${money(p.payments || 0)}<br>
        <strong>${t('net')}: ${money(p.net)}</strong>
      </div>`;
  }
}
function openSalaryPayment(empDocId){ const emp=state.employees.find(e=>e.docId===empDocId); if(!emp) return toast(t('noData'),'error'); const mode=selectedPayrollMode(); const date=selectedPayrollDate(); const p=payrollForEmployee(emp,mode,date); $('payEmployeeDocId').value=emp.docId; $('payEmployeeName').value=`${emp.name||''} - ${emp.employeeId||''}`; $('payMode').value=mode; $('payDate').value=date; $('payAmount').value=Math.max(0,Math.round(Number(p.net||0)*100)/100); $('payNote').value=''; updatePaymentPreview(); $('paymentDialog').showModal(); }
async function saveSalaryPayment(ev){ ev?.preventDefault(); await safe('salary payment', async()=>{ if(!requireFields([['payEmployeeDocId',t('employee')],['payDate',t('date')],['payAmount',t('amount')]])) return; const emp=state.employees.find(e=>e.docId===$('payEmployeeDocId').value); if(!emp) throw new Error(t('noData')); const mode=$('payMode').value||'monthly'; const baseDate=$('payDate').value||todayISO(); const p=payrollForEmployee(emp,mode,baseDate); const amount=Number($('payAmount').value||0); if(amount<=0) throw new Error(t('fillRequired')); if(amount>Number(p.net||0)+0.01 && !confirm(`${t('paidAmount')} > ${t('net')}. ${t('confirmPayment')}?`)) return; const txData={uid:emp.uid||emp.docId,employeeDocId:emp.docId,employeeName:emp.name||'',employeeId:emp.employeeId||'',email:emp.email||'',type:'salary_payment',amount,date:baseDate,note:$('payNote').value || (amount>=p.net?t('fullPayment'):t('partialPayment')),source:'salary_payment',payrollPeriod:mode,baseDate,netBefore:Number(p.net||0),remainingAfter:Math.max(0,Number(p.net||0)-amount)}; await api.addTransaction(txData); state.transactions=[...state.transactions,{docId:'local-'+Date.now(),...txData}]; $('paymentDialog').close(); renderPayroll(); renderStats(); toast(t('paymentDone')); }); }

function renderPayroll(){ const root=$('payrollList'); if(!root) return; const q=($('payrollSearch')?.value||'').toLowerCase(), mode=selectedPayrollMode(), date=selectedPayrollDate(); const pr=periodRange(mode,date); const rows=state.employees.filter(e=>[e.name,e.employeeId,e.email].join(' ').toLowerCase().includes(q)).map(e=>payrollForEmployee(e,mode,date)); root.innerHTML=rows.map(p=>{ const txRows=(p.tx||[]).map(x=>`<div class="mini-row"><span>${x.date||'-'} • ${txLabel(x.type)} • ${x.type==='salary_payment'?'-':''}${money(x.amount)}</span><small>${x.source==='request'?t('sourceRequest'):x.source==='salary_payment'?t('salarySettlement'):t('manual')} ${x.payrollPeriod&&x.payrollPeriod!=='auto'?`• ${t(x.payrollPeriod)}`:x.scope&&x.scope!=='auto'?`• ${t(x.scope)}`:''} ${x.note?`- ${x.note}`:''}</small><button class="tiny danger" data-act="deleteTx" data-id="${x.docId}">×</button></div>`).join('') || `<div class="muted">${t('noData')}</div>`; const dId=`payrollDetails_${p.emp.docId}`; const shiftName=p.shift?.name||p.emp.shiftName||'-'; return `<div class="card payroll-card"><div class="payroll-card-head"><div><h3>${p.emp.name} <span class="muted">${p.emp.employeeId||''}</span></h3></div><button class="diamond mini-toggle" data-act="togglePayrollDetails" data-target="${dId}">${t('showDetails')}</button></div><div class="payroll-details hidden" id="${dId}"><div><b>${t('employeeDetails')}</b></div><p>${t('email')}: ${p.emp.email||'-'}</p><p>${t('phone')}: ${p.emp.phone||'-'}</p><p>${t('department')}: ${p.emp.department||'-'}</p><p>${t('job')}: ${p.emp.job||'-'}</p><p>${t('shift')}: ${shiftName}</p><p>${t('dailyHours')}: ${p.emp.dailyHours||p.shift?.dailyHours||8}</p><p>${t('period')}: ${t(mode)} - ${pr.start} → ${pr.end}</p><p>${t('workedHours')}: ${Number(p.workedHours||0).toFixed(2)}</p><p>${t('hourRate')}: ${money(p.hourRate)}</p><p>${t('gross')}: ${Number(p.workedHours||0).toFixed(2)} × ${money(p.hourRate)} = ${money(p.base)}</p></div><p>${t('gross')}: ${money(p.base)}</p><p>${t('hourRate')}: ${money(p.hourRate)}</p><p>${t('advances')}: -${money(p.advances)}</p><p>${t('deductions')}: -${money(p.deductions)}</p><p>${t('payments')}: -${money(p.payments||0)}</p><h3>${t('net')}: ${money(p.net)}</h3><details><summary>${t('transactions')}</summary>${txRows}</details><div class="card-actions"><button class="diamond success" data-act="paySalary" data-id="${p.emp.docId}">${t('paySalary')}</button><button class="diamond" data-act="addTx" data-id="${p.emp.docId}">${t('addPayrollTransaction')}</button><button class="diamond" data-act="printPayroll" data-id="${p.emp.docId}">${t('print')}</button></div></div>`; }).join('') || `<div class="card">${t('noData')}</div>`; }
function printPayroll(id){
  const e = state.employees.find(x => x.docId === id);
  if(!e) return toast(t('noData'), 'error');

  const mode = selectedPayrollMode();
  const baseDate = selectedPayrollDate();
  const p = payrollForEmployee(e, mode, baseDate);
  const pr = typeof periodRange === 'function' ? periodRange(mode, baseDate) : {start:baseDate,end:baseDate};

  const rows = (p.dayRows || []).map((d,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${d.date}</td>
      <td>${prettyTime(d.in)}</td>
      <td>${prettyTime(d.out)}</td>
      <td>${formatHours(d.workedMin)}</td>
      <td class="a4-only">${d.out ? '--' : 'Open'}</td>
    </tr>`).join('') || `<tr><td colspan="6">${t('noData')}</td></tr>`;

  const receiptRows = (p.dayRows || []).map(d => `
    <tr>
      <td>${String(d.date||'').slice(5)}</td>
      <td>${prettyTime(d.in)}</td>
      <td>${prettyTime(d.out)}</td>
      <td>${Number((d.workedMin||0)/60).toFixed(2)}</td>
    </tr>`).join('') || `<tr><td colspan="4">${t('noData')}</td></tr>`;

  const txRows = (p.tx || []).map((x,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${x.date || '-'}</td>
      <td>${txLabel(x.type)}</td>
      <td>${money(x.amount)}</td>
      <td class="a4-only">${(x.payrollPeriod&&x.payrollPeriod!=='auto'?t(x.payrollPeriod)+' - ':'') + (x.note || '')}</td>
    </tr>`).join('') || `<tr><td colspan="5">${t('noData')}</td></tr>`;

  const receiptNo = `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  printHtml(`${e.name} payroll`, `
    <div class="head">
      <div>
        <h1 class="brand-title">${state.settings.companyName || 'HR Glass Pro'}</h1>
        <p class="subtitle">${t('payroll')} / ${t('salarySettlement')}</p>
      </div>
      <div>
        <span class="badge">${receiptNo}</span>
        <p class="subtitle">${pr.start} → ${pr.end} • ${t(mode)}</p>
      </div>
    </div>
    <div class="grid">
      <div class="box"><b>${t('employee')}</b>${e.name || '-'}</div>
      <div class="box"><b>${t('employeeId')}</b>${e.employeeId || '-'}</div>
      <div class="box"><b>${t('department')}</b>${e.department || '-'}</div>
      <div class="box"><b>${t('shift')}</b>${p.shift?.name || e.shiftName || '-'}</div>
    </div>
    <table>
      <tr><th>${t('salary')}</th><td>${money(e.salary)}</td><th>${t('dailyHours')}</th><td>${p.dailyHours}</td></tr>
      <tr><th>${t('workedHours')}</th><td>${Number(p.workedHours || 0).toFixed(2)}</td><th>${t('hourRate')}</th><td>${money(p.hourRate)}</td></tr>
      <tr><th>${t('gross')}</th><td class="positive">${money(p.base)}</td><th>${t('advances')}</th><td class="negative">-${money(p.advances)}</td></tr>
      <tr><th>${t('deductions')}</th><td class="negative">-${money(p.deductions)}</td><th>${t('payments')}</th><td class="negative">-${money(p.payments || 0)}</td></tr>
      <tr><th class="total">${t('net')}</th><td class="total" colspan="3">${money(p.net)}</td></tr>
    </table>
    <h3>${t('attendance')}</h3>
    <table class="a4-only"><tr><th>#</th><th>${t('date')}</th><th>IN</th><th>OUT</th><th>${t('hours')}</th><th>${t('note')}</th></tr>${rows}</table>
    <table class="receipt-only"><tr><th>${t('date')}</th><th>IN</th><th>OUT</th><th>${t('hours')}</th></tr>${receiptRows}</table>
    <h3>${t('transactions')}</h3>
    <table><tr><th>#</th><th>${t('date')}</th><th>${t('type')}</th><th>${t('amount')}</th><th class="a4-only">${t('note')}</th></tr>${txRows}</table>
    <div class="signatures"><div class="sig">${t('employee')} Signature</div><div class="sig">Manager Signature</div></div>
  `);
}

function fillSettings(){ if(!$('setCompanyName')) return; $('setCompanyName').value=state.settings.companyName||''; $('setGpsEnabled').value=String(state.settings.gpsEnabled===true||state.settings.gpsEnabled==='true'); $('setLat').value=state.settings.lat||''; $('setLng').value=state.settings.lng||''; $('setRadius').value=state.settings.radius||150; }
async function saveSettings(){ await safe('settings', async()=>{ await api.saveSettings({companyName:$('setCompanyName').value,gpsEnabled:$('setGpsEnabled').value==='true',lat:Number($('setLat').value||0),lng:Number($('setLng').value||0),radius:Number($('setRadius').value||150)}); toast(t('saved')); }); }
async function importFingerprint(){ await safe('fingerprint', async()=>{ const f=$('fingerprintFile').files[0]; if(!f) throw new Error(t('fillRequired')); const rows=parseCsv(await f.text()); let count=0; for(const r of rows){ const emp=state.employees.find(e=>String(e.fingerprintId)===String(r.fingerprintId)); if(emp){ await api.addAttendance({uid:emp.uid||emp.docId, employeeDocId:emp.docId, date:r.date, time:r.time, type:String(r.type||'IN').toUpperCase().startsWith('O')?'OUT':'IN', source:'fingerprint', fingerprintId:r.fingerprintId}); count++; } } $('importResult').textContent=`${t('importDone')}: ${count}`; toast(t('importDone')); }); }
async function backup(){ await safe('backup', async()=>{ const data=await api.backupData(); download(`hr-backup-${todayISO()}.json`, JSON.stringify(data,null,2),'application/json'); toast(t('backupDone')); }); }
async function restore(){ await safe('restore', async()=>{ const f=$('restoreFile').files[0]; if(!f) throw new Error(t('fillRequired')); await api.restoreData(JSON.parse(await f.text())); toast(t('restoreDone')); }); }
function exportAttendance(){ const date=$('attendanceDate')?.value||todayISO(); const rows=state.employees.map(e=>{ const d=calcDay(e,employeeShift(e,state.shifts),state.attendance,date); return {employeeId:e.employeeId,name:e.name,date,in:d.in,out:d.out,hours:formatHours(d.workedMin),late:formatHours(d.lateMin),overtime:formatHours(d.overtimeMin)}; }); download('attendance.csv',toCsv(rows),'text/csv'); }
function exportPayroll(){ const rows=state.employees.map(e=>{ const p=calcPayroll(e,state.shifts,state.attendance,state.transactions,$('payrollPeriod').value,$('payrollDate').value||todayISO()); return {employeeId:e.employeeId,name:e.name,base:p.base,overtime:p.overtime,advances:p.advances,deductions:p.deductions,net:p.net}; }); download('payroll.csv',toCsv(rows),'text/csv'); }


async function updateSyncStatus(){
  const count = await queueCount().catch(()=>0);
  let el = document.getElementById('syncStatus');
  if(!el){
    el = document.createElement('button');
    el.id = 'syncStatus';
    el.className = 'pill sync-status';
    el.type = 'button';
    document.querySelector('.top-actions')?.prepend(el);
  }
  el.textContent = navigator.onLine
    ? (count ? `🟡 Sync pending: ${count}` : '🟢 Online')
    : `🔴 Offline${count ? ' / pending: '+count : ''}`;
}

async function runSyncNow(){
  if(!navigator.onLine) return updateSyncStatus();
  const res = await syncOfflineQueue().catch(e=>({error:e,done:0,remaining:0}));
  await updateSyncStatus();
  if(res && !res.error && res.done) toast(`Synced ${res.done}`);
}

function setupEvents(){
  bind('loginBtn',()=>safe('login',async()=>{ await signInWithEmailAndPassword(auth,$('loginEmail').value,$('loginPassword').value); })); bind('logoutBtn',()=>signOut(auth)); bind('langBtn',toggleLang); bind('langBtnLogin',toggleLang); bind('themeBtn',toggleTheme); bind('themeBtnLogin',toggleTheme);
  document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>showSection(b.dataset.section)); bind('newEmployeeBtn',()=>openEmployee()); bind('newShiftBtn',()=>openShift()); bind('newTransactionBtn',()=>openTransaction());
  $('employeeSearch')?.addEventListener('input',renderEmployees); $('requestsSearch')?.addEventListener('input',renderRequests); $('attendanceSearch')?.addEventListener('input',renderAttendance); $('attendanceDate')?.addEventListener('change',renderAttendance); $('payrollSearch')?.addEventListener('input',renderPayroll); $('payrollPeriod')?.addEventListener('change',renderPayroll); $('payrollDate')?.addEventListener('change',renderPayroll);
  $('employeeForm')?.addEventListener('submit',saveEmployeeForm); $('shiftForm')?.addEventListener('submit',saveShiftForm); $('transactionForm')?.addEventListener('submit',saveTransactionForm); $('paymentForm')?.addEventListener('submit',saveSalaryPayment); bind('checkInBtn',()=>check('IN')); bind('checkOutBtn',()=>check('OUT')); bind('sendRequestBtn',sendMyRequest); bind('saveSettingsBtn',saveSettings); bind('importFingerprintBtn',importFingerprint); bind('backupBtn',backup); bind('restoreBtn',restore); bind('exportAttendanceBtn',exportAttendance); bind('exportPayrollBtn',exportPayroll); bind('syncStatus',runSyncNow); window.addEventListener('online',runSyncNow); window.addEventListener('offline',updateSyncStatus);
  document.body.addEventListener('click',e=>{ const closeBtn=e.target.closest('[data-close-dialog]'); if(closeBtn){ e.preventDefault(); e.stopPropagation(); closeBtn.closest('dialog')?.close(); } });
  bind('saveShiftBtn',()=>{ const f=$('shiftForm'); if(f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{cancelable:true})); });
  bind('saveTransactionBtn',()=>{ const f=$('transactionForm'); if(f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{cancelable:true})); });
  bind('confirmPaymentBtn',()=>{ const f=$('paymentForm'); if(f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{cancelable:true})); });
  $('payAmount')?.addEventListener('input',updatePaymentPreview); $('payMode')?.addEventListener('change',updatePaymentPreview); $('payDate')?.addEventListener('change',updatePaymentPreview);
  bind('saveEmployeeBtn',()=>{ const f=$('employeeForm'); if(f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{cancelable:true})); });
  document.body.addEventListener('click',async e=>{ const btn=e.target.closest('[data-act]'); if(!btn) return; const id=btn.dataset.id, act=btn.dataset.act; if(act==='editEmp') openEmployee(id); if(act==='toggleEmp'){ const emp=state.employees.find(x=>x.docId===id); await api.saveEmployee({active:!(emp.active!==false)},id); } if(act==='deleteEmp'&&confirm(t('confirmDelete'))){ await api.deleteEmployee(id); toast(t('deleted')); } if(act==='editShift') openShift(id); if(act==='deleteShift'&&confirm(t('confirmDelete'))){ await api.deleteShift(id); toast(t('deleted')); } if(act==='approveReq') approveRequest(id,'approved'); if(act==='rejectReq') approveRequest(id,'rejected'); if(act==='togglePayrollDetails'){ const box=$(btn.dataset.target); if(box){ const isHidden=box.classList.toggle('hidden'); btn.textContent=isHidden?t('showDetails'):t('hideDetails'); } } if(act==='toggleRequests'){ const box=$(btn.dataset.target); if(box){ const isHidden=box.classList.toggle('hidden'); btn.textContent=isHidden?t('showDetails'):t('hideDetails'); } } if(act==='addTx') openTransaction(id); if(act==='paySalary') openSalaryPayment(id); if(act==='deleteTx'&&confirm(t('confirmDelete'))){ await api.deleteTransaction(id); toast(t('deleted')); } if(act==='printPayroll'||act==='printEmp') printPayroll(id); });
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; $('installBtn')?.classList.remove('hidden'); }); bind('installBtn',async()=>{ if(deferredPrompt){deferredPrompt.prompt(); deferredPrompt=null;} });
}

function init(){ setTheme(localStorage.getItem('hr_theme')||'light'); applyLang(); setupEvents(); $('attendanceDate')&&($('attendanceDate').value=todayISO()); $('payrollDate')&&($('payrollDate').value=todayISO()); renderShiftDays(['sun','mon','tue','wed','thu']); updateSyncStatus(); if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(console.warn); onAuthStateChanged(auth, user=>{ state.user=user; if(!user){ clearSubs(); $('loginView')?.classList.remove('hidden'); $('appView')?.classList.add('hidden'); } else startRealtime(); }); }
init();
