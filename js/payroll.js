import { minutesBetween, timeToMinutes, todayISO } from './utils.js';

const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const round2 = (v) => Math.round(num(v) * 100) / 100;
function normType(v){
  const s = String(v || '').trim().toLowerCase().replaceAll('-', '').replaceAll('_', '').replaceAll(' ', '');
  if(['in','checkin','signin','start','حضور','دخول'].includes(s)) return 'IN';
  if(['out','checkout','signout','end','انصراف','خروج'].includes(s)) return 'OUT';
  return String(v || '').toUpperCase();
}

function normalizeDateString(v){
  if(!v) return '';
  if(typeof v === 'string'){
    // Accept YYYY-MM-DD, ISO strings, and Firebase timestamp-like text
    const m = v.match(/\d{4}-\d{2}-\d{2}/);
    if(m) return m[0];
  }
  try{
    const d = v?.toDate ? v.toDate() : new Date(v);
    if(!isNaN(d)) return d.toISOString().slice(0,10);
  }catch{}
  return '';
}

function localDate(v){
  const s = normalizeDateString(v) || todayISO();
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function periodRange(mode, baseDate){
  const base = normalizeDateString(baseDate) || todayISO();
  const b = localDate(base);

  if(mode === 'daily'){
    return { start: base, end: base };
  }

  if(mode === 'weekly'){
    // Business week for Egypt/common local HR: Saturday -> Friday.
    // JS: Saturday = 6. Move back to the previous/current Saturday.
    const start = new Date(b);
    const diff = (b.getDay() + 1) % 7;
    start.setDate(b.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: start.toISOString().slice(0,10),
      end: end.toISOString().slice(0,10)
    };
  }

  // monthly and hourly use selected month
  const y = b.getFullYear();
  const m = b.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return {
    start: start.toISOString().slice(0,10),
    end: end.toISOString().slice(0,10)
  };
}

export function dateInPeriod(date, mode, baseDate){
  const ds = normalizeDateString(date);
  if(!ds) return false;
  const r = periodRange(mode, baseDate);
  return ds >= r.start && ds <= r.end;
}



function transactionInPayrollPeriod(tx, mode, baseDate){
  const txDate = normalizeDateString(tx.date || tx.createdAt);
  if(!txDate) return false;

  const scope = String(tx.payrollPeriod || tx.scope || 'auto').toLowerCase();

  // Backward compatible: old transactions work by their date only.
  if(scope === 'auto' || scope === 'once' || scope === ''){
    return dateInPeriod(txDate, mode, baseDate);
  }

  // Daily movement:
  // appears in the selected day, and also rolls up inside its week/month.
  if(scope === 'daily'){
    return dateInPeriod(txDate, mode, baseDate);
  }

  // Weekly movement:
  // appears in the selected week, and also rolls up inside the selected month.
  if(scope === 'weekly'){
    if(mode === 'daily') return false;
    const txWeek = periodRange('weekly', txDate);
    const current = periodRange(mode === 'monthly' || mode === 'hourly' ? 'monthly' : 'weekly', baseDate);
    if(mode === 'weekly') return txWeek.start === current.start && txWeek.end === current.end;
    return txWeek.start >= current.start && txWeek.start <= current.end;
  }

  // Monthly movement:
  // appears only in monthly/hourly month view.
  if(scope === 'monthly'){
    if(mode === 'daily' || mode === 'weekly') return false;
    return dateInPeriod(txDate, 'monthly', baseDate);
  }

  return dateInPeriod(txDate, mode, baseDate);
}

export function employeeShift(emp, shifts){
  return shifts.find(s => s.docId === emp.shiftId) || shifts.find(s => s.name === emp.shiftName) || null;
}

export function employeeKeys(emp){
  return [emp?.uid, emp?.docId, emp?.employeeDocId, emp?.employeeId, emp?.email, emp?.fingerprintId]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(v => String(v).trim());
}

export function attendanceBelongsToEmployee(a, emp){
  const keys = employeeKeys(emp);
  const vals = [a?.uid, a?.employeeDocId, a?.employeeId, a?.email, a?.fingerprintId]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(v => String(v).trim());
  return vals.some(v => keys.includes(v));
}

export function groupAttendance(attendance, emp, date){
  const rows = attendance
    .filter(a => attendanceBelongsToEmployee(a, emp) && normalizeDateString(a.date) === normalizeDateString(date))
    .sort((a,b) => (a.time || '').localeCompare(b.time || ''));

  const firstIn = rows.find(r => normType(r.type) === 'IN');
  const lastOut = [...rows].reverse().find(r => normType(r.type) === 'OUT');

  return { rows, in:firstIn?.time || '', out:lastOut?.time || '' };
}

export function payrollDailyHours(emp, shift){
  return num(emp.dailyHours || shift?.dailyHours || shift?.hours || 8, 8) || 8;
}

export function payrollDayCount(emp){
  // default 30 because the user requested: 3000 / 30 days / daily hours
  return num(emp.payrollDays || emp.monthDays || 30, 30) || 30;
}

export function payrollHourRate(emp, shift){
  const manual = num(emp.hourRate || 0);
  if(manual > 0) return manual;

  const salary = num(emp.salary || 0);
  const days = payrollDayCount(emp);
  const dailyHours = Math.max(1, payrollDailyHours(emp, shift));
  return salary / days / dailyHours;
}

export function calcDay(emp, shift, attendance, date){
  const g = groupAttendance(attendance, emp, date);
  const dailyHours = payrollDailyHours(emp, shift);
  const requiredMin = dailyHours * 60;

  const workedMin = (g.in && g.out) ? minutesBetween(g.in, g.out) : 0;

  const start = shift?.start || shift?.startTime || '';
  const grace = num(shift?.grace || shift?.graceMinutes || 0);
  const lateMin = (g.in && start) ? Math.max(0, timeToMinutes(g.in) - timeToMinutes(start) - grace) : 0;

  // This is for reports only. Payroll is based on actual worked hours.
  const missingMin = Math.max(0, requiredMin - workedMin);
  const overtimeMin = Math.max(0, workedMin - requiredMin);

  const hourRate = payrollHourRate(emp, shift);
  const earned = (workedMin / 60) * hourRate;
  const deduction = (missingMin / 60) * hourRate;
  const overtime = (overtimeMin / 60) * hourRate;

  return {
    date,
    in:g.in,
    out:g.out,
    workedMin,
    requiredMin,
    lateMin,
    missingMin,
    overtimeMin,
    hourRate: round2(hourRate),
    earned,
    deduction,
    overtime,
    status:g.in && !g.out ? 'present' : g.in && g.out ? 'done' : 'off'
  };
}

export function calcPayroll(emp, shifts, attendance, transactions, mode, baseDate){
  const shift = employeeShift(emp, shifts);
  const empAttendance = attendance.filter(a => attendanceBelongsToEmployee(a, emp));
  const days = [...new Set(empAttendance.map(a => normalizeDateString(a.date)))]
    .filter(d => dateInPeriod(d, mode, baseDate))
    .sort();

  const dayRows = days.map(d => calcDay(emp, shift, attendance, d));
  const workedHours = dayRows.reduce((s,d) => s + (d.workedMin || 0), 0) / 60;
  const requiredHours = dayRows.reduce((s,d) => s + (d.requiredMin || 0), 0) / 60;
  const overtimeHours = dayRows.reduce((s,d) => s + (d.overtimeMin || 0), 0) / 60;

  const hourRate = payrollHourRate(emp, shift);

  // New requested rule:
  // salary is paid by actual attendance hours.
  // No worked hours in the period => base earning = 0.
  const base = workedHours * hourRate;

  const empKeys = employeeKeys(emp);
  const tx = transactions.filter(x => {
    const txKeys = [x.uid, x.employeeDocId, x.employeeId, x.email, x.fingerprintId]
      .filter(Boolean).map(String);
    const belongs = txKeys.some(k => empKeys.includes(k));
    return belongs && transactionInPayrollPeriod(x, mode, baseDate);
  });

  const advances = tx.filter(x => x.type === 'advance').reduce((s,x) => s + num(x.amount || 0), 0);
  const manualDed = tx.filter(x => ['deduction','absence'].includes(x.type)).reduce((s,x) => s + num(x.amount || 0), 0);
  const bonus = tx.filter(x => ['bonus','overtime','adjustment'].includes(x.type)).reduce((s,x) => s + num(x.amount || 0), 0);
  const payments = tx.filter(x => x.type === 'salary_payment').reduce((s,x) => s + num(x.amount || 0), 0);

  // Overtime is already included in actual worked hours base.
  // If admin adds overtime manually, it comes through bonus via transactions.
  const autoDeductions = 0;
  const overtime = 0;

  const net = base + bonus - autoDeductions - manualDed - advances - payments;

  return {
    emp,
    shift,
    dayRows,
    base: round2(base),
    earned: round2(base),
    overtime: round2(overtime),
    bonus: round2(bonus),
    deductions: round2(manualDed),
    advances: round2(advances),
    payments: round2(payments),
    net: round2(net),
    tx,
    workedHours,
    requiredHours,
    overtimeHours,
    hourRate: round2(hourRate),
    payrollDays: payrollDayCount(emp),
    dailyHours: payrollDailyHours(emp, shift)
  };
}
