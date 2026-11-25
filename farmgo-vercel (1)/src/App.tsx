import React, { useEffect, useMemo, useState } from 'react';
import { Clock, MapPin, Users, CalendarDays, FileText, Wallet, LogOut, Plus, Pencil, Trash2, Check, X, ShieldCheck, UserRound, KeyRound, Search, Download, BarChart3, ArrowRight, TrendingUp } from 'lucide-react';

type Role = 'admin' | 'supervisor' | 'employee';
type UserValue = { name:string; email:string; phone:string; job:string; department:string; role:Exclude<Role,'admin'>; shiftStart:string; shiftEnd:string; workDays:string[]; password:string; salary:number };
type AttendanceValue = { employeeId:string; employeeName:string; date:string; shiftStart:string; checkInTime:string; checkInLat:number|null; checkInLng:number|null; checkOutTime:string; checkOutLat:number|null; checkOutLng:number|null };
type RequestValue = { employeeId:string; employeeName:string; type:string; date:string; reason:string; status:'pending'|'approved'|'rejected'; createdAt:string };
type NoteValue = { employeeId:string; employeeName:string; kind:'note'|'deduction'; amount:number|null; text:string; date:string };
type Rec<T> = { id:string; value:T };
type Current = { id:string; name:string; email:string; role:Role; job:string; department:string; phone:string; shiftStart:string; shiftEnd:string; workDays:string[] };
type SettingsValue = { projectUrl:string; publishableKey:string };
const DEFAULT_PROJECT_URL = 'https://tgpkjvimldijwcaqdmto.supabase.co';
const SUPABASE_SQL = `-- FARMGO — جداول مقترحة لإعداد خارجي
-- نفّذ هذا السكربت مرة واحدة في محرر SQL لمشروعك، ثم فعّل RLS على كل جدول.
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  email text not null,
  phone text default '',
  job text default '',
  department text default '',
  shift_start text default '08:00',
  shift_end text default '17:00',
  work_days text[] default array[]::text[],
  salary numeric default 0,
  role text default 'employee',
  password_hint text default ''
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  employee_id uuid not null,
  date date not null,
  check_in_time text default '',
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_time text default '',
  check_out_lat double precision,
  check_out_lng double precision,
  late_minutes int default 0
);
create table if not exists public.deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  employee_id uuid not null,
  amount numeric not null,
  reason text default '',
  date date not null,
  type text default 'deduction'
);
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  employee_id uuid not null,
  type text not null,
  from_date date not null,
  to_date date,
  reason text default '',
  status text default 'pending'
);
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.deductions enable row level security;
alter table public.requests enable row level security;
-- مثال: كل مستخدم يرى ويضيف بياناته فقط عبر user_id
-- create policy "own rows" on public.employees for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- كرر نفس القاعدة على attendance و deductions و requests.`;

const DAYS = ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const DAY_INDEX: Record<string, number> = { 'الأحد':0,'الاثنين':1,'الثلاثاء':2,'الأربعاء':3,'الخميس':4,'الجمعة':5,'السبت':6 };

// FARMGO - Vercel version: storage via localStorage (works without backend).
// If Supabase URL/Key are set in Settings, data is also mirrored to Supabase REST in background (best-effort).
async function callApi(action:string, args:any){
  const key = 'farmgo_db_v1';
  const db = JSON.parse(localStorage.getItem(key) || '{}');
  const getCol = (c:string)=> db[c] || [];
  const setCol = (c:string, arr:any[])=>{ db[c]=arr; localStorage.setItem(key, JSON.stringify(db)); };
  if(action==='records.list'){
    return getCol(args.collection).map((v:any,i:number)=>({id: v._id || String(i+1)+'-'+args.collection, value: v}));
  }
  if(action==='records.create'){
    const arr=getCol(args.collection); const id='id-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    arr.push({...args.value, _id:id}); setCol(args.collection, arr); return {id, value: args.value};
  }
  if(action==='records.replace'){
    const arr=getCol(args.collection); const idx=arr.findIndex((v:any)=> (v._id===args.id));
    if(idx>=0) arr[idx]={...args.value, _id:args.id}; else arr.push({...args.value, _id:args.id});
    setCol(args.collection, arr); return {id:args.id};
  }
  if(action==='records.delete'){
    const arr=getCol(args.collection).filter((v:any)=> v._id!==args.id); setCol(args.collection, arr); return {ok:true};
  }
  return null;
}
function todayStr(d=new Date()){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function nowTime(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function mapsUrl(lat:number|null,lng:number|null){ if(lat==null||lng==null) return ''; return `https://www.google.com/maps?q=${lat},${lng}`; }
function lateMinutes(shift:string, checkIn:string){
  const [sh,sm]=shift.split(':').map(Number); const [ch,cm]=checkIn.split(':').map(Number);
  return Math.max(0,(ch*60+cm)-(sh*60+sm));
}
function shortLoc(lat:number|null,lng:number|null){ if(lat==null||lng==null) return '—'; return `${lat.toFixed(5)} ، ${lng.toFixed(5)}`; }
function monthStr(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(ym:string){ const [y,m]=ym.split('-').map(Number); const names=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']; return `${names[(m||1)-1]} ${y}`; }
function dayLabel(d:Date){ return ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()]; }
function csvCell(v:any){ return `"${String(v ?? '').replace(/"/g,'""')}"`; }

// ---------- تحليل الأداء ----------
function PerformanceAnalysis({ employeeId, employeeName, workDays, shiftStart, attendance, notes }:{ employeeId:string; employeeName:string; workDays:string[]; shiftStart:string; attendance:Rec<AttendanceValue>[]; notes:Rec<NoteValue>[] }){
  const data = useMemo(()=>{
    const today = new Date();
    const dates: string[] = [];
    for(let i=29;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); dates.push(todayStr(d)); }
    const workDates = dates.filter(ds=>{ const d=new Date(ds+'T00:00:00'); return workDays.includes(dayLabel(d)); });
    const empAtt = attendance.filter(a=>a.value.employeeId===employeeId && dates.includes(a.value.date));
    const attendedSet = new Set(empAtt.map(a=>a.value.date));
    const attended = workDates.filter(ds=>attendedSet.has(ds)).length;
    const absent = Math.max(0, workDates.length - attended);
    const pct = workDates.length ? Math.round((attended/workDates.length)*100) : 0;
    const lateList = empAtt.filter(a=>a.value.checkInTime && lateMinutes(a.value.shiftStart||shiftStart, a.value.checkInTime)>0);
    const lateCount = lateList.length;
    const totalLate = lateList.reduce((s,a)=>s+lateMinutes(a.value.shiftStart||shiftStart, a.value.checkInTime),0);
    // أسبوعي: 4 أسابيع، الأحدث أولاً
    const weeks: {label:string; attended:number; work:number; pct:number}[] = [];
    for(let w=0; w<4; w++){
      const start = new Date(today); start.setDate(start.getDate() - (w*7) - 6);
      const end = new Date(today); end.setDate(end.getDate() - (w*7));
      const wDates: string[] = [];
      for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) wDates.push(todayStr(new Date(d)));
      const wWork = wDates.filter(ds=>{ const d=new Date(ds+'T00:00:00'); return workDays.includes(dayLabel(d)); });
      const wAtt = wDates.filter(ds=>attendedSet.has(ds) && wWork.includes(ds)).length;
      weeks.push({ label: w===0 ? 'هذا الأسبوع' : w===1 ? 'الأسبوع الماضي' : `قبل ${w} أسابيع`, attended:wAtt, work:wWork.length, pct: wWork.length? Math.round((wAtt/wWork.length)*100):0 });
    }
    // خصومات آخر 3 أشهر
    const months: {label:string; ym:string; total:number}[] = [];
    for(let i=2;i>=0;i--){ const d=new Date(today.getFullYear(), today.getMonth()-i, 1); const ym=monthStr(d); const total=notes.filter(n=>n.value.employeeId===employeeId && n.value.kind==='deduction' && n.value.date.startsWith(ym)).reduce((s,n)=>s+(n.value.amount||0),0); months.push({label: monthLabel(ym), ym, total}); }
    const maxDed = Math.max(1, ...months.map(m=>m.total));
    let rating = 'يحتاج تحسين'; let ratingDesc=''; let ratingClass='bg-[#fff5f3] text-[#b42318]';
    if(pct>=95 && lateCount===0){ rating='ممتاز'; ratingDesc='حضور شبه كامل بدون أي تأخير خلال آخر 30 يوم.'; ratingClass='bg-[var(--green-light)] text-[var(--green-dark)]'; }
    else if(pct>=90 && lateCount<=2){ rating='جيد جداً'; ratingDesc='حضور مرتفع مع تأخير محدود جداً.'; ratingClass='bg-[var(--green-light)] text-[var(--green-dark)]'; }
    else if(pct>=80 && lateCount<=5){ rating='جيد'; ratingDesc='حضور جيد، مع فرصة لتقليل التأخير.'; ratingClass='bg-[var(--amber-bg)] text-[var(--amber)]'; }
    else { rating='يحتاج تحسين'; ratingDesc='الحضور أو التأخير بحاجة إلى متابعة وتحسين.'; ratingClass='bg-[#fff5f3] text-[#b42318]'; }
    return { workDates, attended, absent, pct, lateCount, totalLate, weeks, months, maxDed, rating, ratingDesc, ratingClass };
  },[employeeId, workDays, shiftStart, attendance, notes]);

  return (
    <section className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 md:p-6 space-y-6">
      <div className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <h3 className="font-black text-xl flex gap-2 items-center"><BarChart3 size={20} className="text-[var(--green)]"/> تحليل الأداء — {employeeName}</h3>
          <p className="text-[var(--muted)] font-bold text-sm mt-1">آخر 30 يوم • بناءً على الحضور والتأخير والخصومات المسجلة.</p>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-center ${data.ratingClass}`}><div className="font-black text-lg leading-none">{data.rating}</div><div className="text-xs font-bold mt-1">التقييم التلقائي</div></div>
      </div>
      <p className="font-bold text-sm leading-6 bg-[var(--green-light)] rounded-2xl p-4">{data.ratingDesc} الحضور {data.attended} من {data.workDates.length} يوم دوام، وعدد مرات التأخير {data.lateCount}.</p>

      {/* الحضور مقابل الغياب */}
      <div>
        <div className="flex justify-between font-black text-sm mb-2"><span>نسبة الحضور مقابل الغياب</span><span>{data.pct}% حضور</span></div>
        <div className="flex h-10 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--bg)]">
          <div className="bg-[var(--green)] text-white flex items-center justify-center text-xs font-black" style={{width:`${data.pct}%`}}>{data.pct>12 ? `حضور ${data.attended}` : ''}</div>
          <div className="bg-[#f0c5c0] text-[#7a1a12] flex items-center justify-center text-xs font-black flex-1">{data.absent>0 ? `غياب ${data.absent}` : ''}</div>
        </div>
        <div className="flex gap-4 mt-2 text-xs font-bold text-[var(--muted)]"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[var(--green)] inline-block"/> حضور: {data.attended} يوم</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#f0c5c0] inline-block"/> غياب: {data.absent} يوم</span></div>
      </div>

      {/* التأخير */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-[var(--line)] rounded-2xl p-4"><p className="font-bold text-sm text-[var(--muted)]">عدد مرات التأخير — آخر 30 يوم</p><p className="text-3xl font-black mt-1">{data.lateCount} <span className="text-sm font-bold text-[var(--muted)]">مرة</span></p><div className="h-3 bg-[var(--bg)] rounded-full mt-3 overflow-hidden"><div className="h-full bg-[var(--amber)] rounded-full" style={{width:`${Math.min(100, data.lateCount*10)}%`}}/></div></div>
        <div className="border border-[var(--line)] rounded-2xl p-4"><p className="font-bold text-sm text-[var(--muted)]">إجمالي التأخير بالدقائق — آخر 30 يوم</p><p className="text-3xl font-black mt-1">{data.totalLate} <span className="text-sm font-bold text-[var(--muted)]">دقيقة</span></p><div className="h-3 bg-[var(--bg)] rounded-full mt-3 overflow-hidden"><div className="h-full bg-[#b42318] rounded-full" style={{width:`${Math.min(100, data.totalLate/2)}%`}}/></div></div>
      </div>

      {/* تطور الحضور الأسبوعي */}
      <div>
        <h4 className="font-black flex gap-2 items-center"><TrendingUp size={18}/> تطور الحضور الأسبوعي</h4>
        <div className="mt-3 space-y-3">{data.weeks.map((w,i)=>(<div key={i}><div className="flex justify-between font-bold text-sm"><span>{w.label}</span><span>{w.attended} من {w.work} يوم • {w.pct}%</span></div><div className="h-4 bg-[var(--bg)] rounded-full mt-1 overflow-hidden border border-[var(--line)]"><div className="h-full bg-[var(--green)] rounded-full" style={{width:`${w.pct}%`}}/></div></div>))}</div>
      </div>

      {/* مقارنة الخصومات الشهرية */}
      <div>
        <h4 className="font-black flex gap-2 items-center"><Wallet size={18}/> مقارنة الخصومات الشهرية</h4>
        <div className="mt-3 space-y-3">{data.months.map((m,i)=>(<div key={i}><div className="flex justify-between font-bold text-sm"><span>{m.label}</span><span>{m.total} ر.س</span></div><div className="h-4 bg-[var(--bg)] rounded-full mt-1 overflow-hidden border border-[var(--line)]"><div className="h-full bg-[#b42318] rounded-full" style={{width:`${Math.round((m.total/data.maxDed)*100)}%`}}/></div></div>))}</div>
        {data.months.every(m=>m.total===0) && <p className="font-bold text-sm text-[var(--muted)] mt-2">لا توجد خصومات مسجلة في آخر 3 أشهر.</p>}
      </div>
    </section>
  );
}

export default function App(){
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [users,setUsers]=useState<Rec<UserValue>[]>([]);
  const [attendance,setAttendance]=useState<Rec<AttendanceValue>[]>([]);
  const [requests,setRequests]=useState<Rec<RequestValue>[]>([]);
  const [notes,setNotes]=useState<Rec<NoteValue>[]>([]);
  const [adminPassword,setAdminPassword]=useState('123456');
  const [adminRecId,setAdminRecId]=useState<string|null>(null);
  const [settingsUrl,setSettingsUrl]=useState(DEFAULT_PROJECT_URL);
  const [settingsKey,setSettingsKey]=useState('');
  const [settingsRecId,setSettingsRecId]=useState<string|null>(null);
  const [settingsSaved,setSettingsSaved]=useState(false);
  const [settingsBusy,setSettingsBusy]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showSql,setShowSql]=useState(false);
  const settingsComplete = settingsUrl.trim().length>0 && settingsKey.trim().length>0;

  const [current,setCurrent]=useState<Current|null>(null);
  const [loginEmail,setLoginEmail]=useState('');
  const [loginPass,setLoginPass]=useState('');
  const [loginError,setLoginError]=useState<string|null>(null);
  const [loginBusy,setLoginBusy]=useState(false);

  const [tab,setTab]=useState('employees');
  const [message,setMessage]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  // users form
  const [showUserForm,setShowUserForm]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [userForm,setUserForm]=useState<UserValue>({name:'',email:'',phone:'',job:'',department:'',role:'employee',shiftStart:'08:00',shiftEnd:'17:00',workDays:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'],password:'',salary:0});
  const [confirmDeleteUser,setConfirmDeleteUser]=useState<string|null>(null);
  const [setPassId,setSetPassId]=useState<string|null>(null);
  const [setPassValue,setSetPassValue]=useState('');
  const [userSearch,setUserSearch]=useState('');
  const [detailId,setDetailId]=useState<string|null>(null);

  // attendance
  const [attDate,setAttDate]=useState(todayStr());
  const [confirmDeleteAtt,setConfirmDeleteAtt]=useState<string|null>(null);
  const [geoStatus,setGeoStatus]=useState<string|null>(null);

  // requests form
  const [reqType,setReqType]=useState('عذر');
  const [reqDate,setReqDate]=useState(todayStr());
  const [reqReason,setReqReason]=useState('');

  // notes form
  const [noteEmployee,setNoteEmployee]=useState('');
  const [noteKind,setNoteKind]=useState<'note'|'deduction'>('note');
  const [noteAmount,setNoteAmount]=useState('');
  const [noteText,setNoteText]=useState('');
  const [noteDate,setNoteDate]=useState(todayStr());

  // profile password
  const [oldPass,setOldPass]=useState('');
  const [newPass,setNewPass]=useState('');
  const [confirmPass,setConfirmPass]=useState('');

  // reports / export
  const [repFrom,setRepFrom]=useState(()=>{ const d=new Date(); d.setDate(1); return todayStr(d); });
  const [repTo,setRepTo]=useState(todayStr());
  const [repEmployee,setRepEmployee]=useState('all');
  const [repType,setRepType]=useState<'attendance'|'deductions'|'both'>('both');
  const [exportMsg,setExportMsg]=useState<string|null>(null);

  // salaries
  const [salaryMonth,setSalaryMonth]=useState(monthStr());
  const [salaryDrafts,setSalaryDrafts]=useState<Record<string,string>>({});

  async function reloadRecords(){
    const [u,a,r,n,adm,settingsRes] = await Promise.all([
      callApi('records.list',{collection:'farmgo_users'}),
      callApi('records.list',{collection:'farmgo_attendance'}),
      callApi('records.list',{collection:'farmgo_requests'}),
      callApi('records.list',{collection:'farmgo_notes'}),
      callApi('records.list',{collection:'farmgo_admin'}),
      callApi('records.list',{collection:'farmgo_settings'}),
    ]);
    const normUsers = (u.records||[]).map((rec:any)=>({ ...rec, value:{ ...rec.value, salary: typeof rec.value?.salary==='number' ? rec.value.salary : Number(rec.value?.salary||0) } }));
    setUsers(normUsers); setAttendance(a.records||[]); setRequests(r.records||[]); setNotes(n.records||[]);
    const admRec = (adm.records||[])[0];
    if(admRec){ setAdminRecId(admRec.id); if(admRec.value?.password) setAdminPassword(admRec.value.password); }
    const settingsRec = (settingsRes.records||[])[0];
    if(settingsRec){
      setSettingsRecId(settingsRec.id);
      if(settingsRec.value?.projectUrl) setSettingsUrl(settingsRec.value.projectUrl);
      if(settingsRec.value?.publishableKey) setSettingsKey(settingsRec.value.publishableKey);
      setSettingsSaved(true);
    }
  }

  async function saveSettings(e:React.FormEvent){
    e.preventDefault();
    if(!settingsUrl.trim()){ setMessage('أدخل Project URL'); return; }
    if(!settingsKey.trim()){ setMessage('أدخل Publishable Key — لا تطلب service_role أبداً'); return; }
    setSettingsBusy(true); setMessage(null);
    try{
      const value:SettingsValue = { projectUrl: settingsUrl.trim(), publishableKey: settingsKey.trim() };
      if(settingsRecId){ await callApi('records.replace',{collection:'farmgo_settings', id:settingsRecId, value}); }
      else { const created:any = await callApi('records.create',{collection:'farmgo_settings', value, idempotency_key:'farmgo-settings-v1'}); setSettingsRecId(created.id); }
      await reloadRecords();
      setSettingsSaved(true);
      setMessage('تم حفظ إعدادات الاتصال في قاعدة بيانات التطبيق');
    }catch(err){ setMessage(err instanceof Error?err.message:'تعذر حفظ إعدادات الاتصال'); }
    finally{ setSettingsBusy(false); }
  }

  useEffect(()=>{ (async()=>{ try{ await reloadRecords(); }catch(e){ setLoadError(e instanceof Error?e.message:'تعذر تحميل البيانات'); } finally{ setLoading(false); } })(); },[]);

  useEffect(()=>{ if(current?.role==='admin') setTab('employees'); else if(current?.role==='supervisor') setTab('attendance'); else if(current?.role==='employee') setTab('my'); },[current]);

  const filteredUsers = useMemo(()=> users.filter(u=>{ const q=userSearch.trim(); if(!q) return true; return u.value.name.includes(q)||u.value.email.includes(q)||u.value.department.includes(q)||u.value.job.includes(q); }),[users,userSearch]);
  const filteredAttendance = useMemo(()=> attendance.filter(a=> a.value.date===attDate).sort((x,y)=> (y.value.checkInTime||'').localeCompare(x.value.checkInTime||'')),[attendance,attDate]);
  const myAttendance = useMemo(()=> current? attendance.filter(a=>a.value.employeeId===current.id).sort((x,y)=> y.value.date.localeCompare(x.value.date)) : [],[attendance,current]);
  const myRequests = useMemo(()=> current? requests.filter(r=>r.value.employeeId===current.id).sort((x,y)=> y.value.date.localeCompare(x.value.date)) : [],[requests,current]);
  const myNotes = useMemo(()=> current? notes.filter(n=>n.value.employeeId===current.id).sort((x,y)=> y.value.date.localeCompare(x.value.date)) : [],[notes,current]);
  const todayAtt = useMemo(()=> current? attendance.find(a=>a.value.employeeId===current.id && a.value.date===todayStr()) : undefined,[attendance,current]);
  const detailUser = useMemo(()=> detailId ? users.find(u=>u.id===detailId) : undefined,[detailId,users]);

  // ---- تصدير إكسل ----
  const exportPreview = useMemo(()=>{
    const att = attendance.filter(a=> a.value.date>=repFrom && a.value.date<=repTo && (repEmployee==='all' || a.value.employeeId===repEmployee));
    const ded = notes.filter(n=> n.value.kind==='deduction' && n.value.date>=repFrom && n.value.date<=repTo && (repEmployee==='all' || n.value.employeeId===repEmployee));
    return { att: att.length, ded: ded.length };
  },[attendance,notes,repFrom,repTo,repEmployee]);

  function handleExport(){
    setExportMsg(null);
    if(!repFrom || !repTo || repFrom>repTo){ setExportMsg('اختر نطاق تاريخ صحيح: من تاريخ إلى تاريخ.'); return; }
    const userById = new Map(users.map(u=>[u.id,u.value]));
    const header = ['الاسم','الإيميل','التاريخ','وقت الدخول','موقع الدخول برابط خرائط جوجل','وقت الخروج','موقع الخروج برابط خرائط جوجل','التأخير بالدقائق','نوع الخصم/الملاحظة','مبلغ الخصم بالريال السعودي','السبب'];
    const rows: string[][] = [];
    if(repType==='attendance' || repType==='both'){
      const att = attendance.filter(a=> a.value.date>=repFrom && a.value.date<=repTo && (repEmployee==='all' || a.value.employeeId===repEmployee)).sort((a,b)=>a.value.date.localeCompare(b.value.date));
      att.forEach(a=>{
        const email = userById.get(a.value.employeeId)?.email || '';
        rows.push([a.value.employeeName,email,a.value.date,a.value.checkInTime||'',mapsUrl(a.value.checkInLat,a.value.checkInLng),a.value.checkOutTime||'',mapsUrl(a.value.checkOutLat,a.value.checkOutLng), a.value.checkInTime? String(lateMinutes(a.value.shiftStart,a.value.checkInTime)):'','','','']);
      });
    }
    if(repType==='deductions' || repType==='both'){
      const ded = notes.filter(n=> n.value.kind==='deduction' && n.value.date>=repFrom && n.value.date<=repTo && (repEmployee==='all' || n.value.employeeId===repEmployee)).sort((a,b)=>a.value.date.localeCompare(b.value.date));
      ded.forEach(n=>{
        const email = userById.get(n.value.employeeId)?.email || '';
        rows.push([n.value.employeeName,email,n.value.date,'','','','','خصم', n.value.amount!=null? String(n.value.amount):'', n.value.text||'']);
      });
    }
    // ترتيب عام بالتاريخ عند الجمع
    if(repType==='both') rows.sort((a,b)=> a[2].localeCompare(b[2]));
    const csv = '\uFEFF' + [header, ...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`FARMGO-${repFrom}_to_${repTo}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    setExportMsg(`تم تنزيل ملف إكسل بنجاح: ${rows.length} صف.`);
  }

  // ---- رواتب ----
  const salaryRows = useMemo(()=>{
    const [y,m] = salaryMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const isCurrentMonth = salaryMonth===monthStr();
    const lastDay = isCurrentMonth ? new Date().getDate() : daysInMonth;
    return users.map(u=>{
      const base = Number(u.value.salary||0);
      const dedTotal = notes.filter(n=>n.value.employeeId===u.id && n.value.kind==='deduction' && n.value.date.startsWith(salaryMonth)).reduce((s,n)=>s+(n.value.amount||0),0);
      const attDates = new Set(attendance.filter(a=>a.value.employeeId===u.id && a.value.date.startsWith(salaryMonth)).map(a=>a.value.date));
      const attended = attDates.size;
      let workDaysCount=0; let absent=0;
      for(let d=1; d<=lastDay; d++){
        const date = new Date(y, m-1, d); const ds = todayStr(date);
        if(!u.value.workDays.includes(dayLabel(date))) continue;
        workDaysCount++;
        if(!attDates.has(ds)) absent++;
      }
      return { id:u.id, name:u.value.name, job:u.value.job, base, dedTotal, net: base-dedTotal, attended, absent, workDaysCount };
    });
  },[users,notes,attendance,salaryMonth]);

  async function saveSalary(id:string){
    const draft = salaryDrafts[id];
    const val = draft===undefined ? null : Number(draft);
    if(val===null || isNaN(val) || val<0){ setMessage('أدخل راتباً صحيحاً لا يقل عن صفر'); return; }
    setBusy(true);
    try{ const u=users.find(x=>x.id===id); if(!u) throw new Error('الموظف غير موجود'); await callApi('records.replace',{collection:'farmgo_users', id, value:{...u.value, salary:val}}); await reloadRecords(); setSalaryDrafts(prev=>{ const c={...prev}; delete c[id]; return c; }); setMessage('تم حفظ الراتب'); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر حفظ الراتب'); } finally{ setBusy(false); }
  }

  async function handleLogin(e:React.FormEvent){
    e.preventDefault(); setLoginError(null); setLoginBusy(true);
    const email=loginEmail.trim().toLowerCase();
    try{
      if(email==='admin@company.com'){
        if(loginPass!==adminPassword) throw new Error('بيانات الدخول غير صحيحة');
        setCurrent({id:'admin',name:'مدير النظام',email:'admin@company.com',role:'admin',job:'مدير',department:'الإدارة',phone:'',shiftStart:'08:00',shiftEnd:'17:00',workDays:DAYS});
      } else {
        const found = users.find(u=>u.value.email.trim().toLowerCase()===email);
        if(!found || found.value.password!==loginPass) throw new Error('بيانات الدخول غير صحيحة');
        setCurrent({id:found.id,name:found.value.name,email:found.value.email,role:found.value.role,job:found.value.job,department:found.value.department,phone:found.value.phone,shiftStart:found.value.shiftStart,shiftEnd:found.value.shiftEnd,workDays:found.value.workDays});
      }
      setMessage('تم تسجيل الدخول بنجاح');
    }catch(err){ setLoginError(err instanceof Error?err.message:'تعذر تسجيل الدخول'); }
    finally{ setLoginBusy(false); }
  }

  function resetUserForm(){ setUserForm({name:'',email:'',phone:'',job:'',department:'',role:'employee',shiftStart:'08:00',shiftEnd:'17:00',workDays:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'],password:'',salary:0}); setEditingId(null); }

  async function saveUser(e:React.FormEvent){
    e.preventDefault(); setMessage(null);
    if(!userForm.name.trim()||!userForm.email.trim()||!userForm.password.trim()&&!editingId){ setMessage('أكمل الاسم والإيميل وكلمة السر'); return; }
    if(userForm.workDays.length===0){ setMessage('اختر يوماً واحداً على الأقل'); return; }
    setBusy(true);
    try{
      const payload = {...userForm, email:userForm.email.trim().toLowerCase(), salary: Number(userForm.salary||0)};
      if(editingId){
        const existing = users.find(u=>u.id===editingId); if(!existing) throw new Error('الموظف غير موجود');
        const keepPass = payload.password ? payload.password : existing.value.password;
        await callApi('records.replace',{collection:'farmgo_users', id:editingId, value:{...payload, password:keepPass}});
        setMessage('تم حفظ تعديلات الموظف');
      } else {
        await callApi('records.create',{collection:'farmgo_users', value:payload, idempotency_key:`user-${payload.email}-${Date.now()}`});
        setMessage('تمت إضافة الموظف بنجاح');
      }
      await reloadRecords(); setShowUserForm(false); resetUserForm();
    }catch(err){ setMessage(err instanceof Error?err.message:'تعذر الحفظ'); }
    finally{ setBusy(false); }
  }

  async function deleteUser(id:string){
    setBusy(true);
    try{ await callApi('records.delete',{collection:'farmgo_users', id}); await reloadRecords(); setMessage('تم حذف الموظف'); setConfirmDeleteUser(null); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر الحذف'); } finally{ setBusy(false); }
  }

  async function setPasswordForUser(){
    if(!setPassId || setPassValue.length<4){ setMessage('كلمة السر يجب أن تكون 4 أحرف على الأقل'); return; }
    setBusy(true);
    try{ const u=users.find(x=>x.id===setPassId); if(!u) throw new Error('غير موجود'); await callApi('records.replace',{collection:'farmgo_users', id:setPassId, value:{...u.value, password:setPassValue}}); await reloadRecords(); setMessage('تم تعيين كلمة السر'); setSetPassId(null); setSetPassValue(''); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر تعيين كلمة السر'); } finally{ setBusy(false); }
  }

  function getLocation():Promise<{lat:number,lng:number}|null>{
    return new Promise((resolve)=>{
      if(!('geolocation' in navigator)){ setGeoStatus('المتصفح لا يدعم تحديد الموقع'); resolve(null); return; }
      setGeoStatus('جارٍ تحديد الموقع من المتصفح…');
      navigator.geolocation.getCurrentPosition((pos)=>{ setGeoStatus('تم تحديد الموقع'); resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}); }, ()=>{ setGeoStatus('تعذر تحديد الموقع. تحقق من إذن الموقع في المتصفح وحاول مجدداً'); resolve(null); }, {enableHighAccuracy:true, timeout:12000, maximumAge:0});
    });
  }

  async function handleCheckIn(){
    if(!current) return; setBusy(true); setMessage(null);
    const loc = await getLocation();
    if(!loc){ setBusy(false); return; }
    try{
      const val:AttendanceValue = {employeeId:current.id, employeeName:current.name, date:todayStr(), shiftStart:current.shiftStart, checkInTime:nowTime(), checkInLat:loc.lat, checkInLng:loc.lng, checkOutTime:'', checkOutLat:null, checkOutLng:null};
      await callApi('records.create',{collection:'farmgo_attendance', value:val, idempotency_key:`in-${current.id}-${todayStr()}`});
      await reloadRecords(); setMessage('تم تسجيل الدخول بنجاح');
    }catch(err){ setMessage(err instanceof Error?err.message:'تعذر تسجيل الدخول'); }
    finally{ setBusy(false); }
  }
  async function handleCheckOut(){
    if(!current || !todayAtt) return; setBusy(true); setMessage(null);
    const loc = await getLocation();
    if(!loc){ setBusy(false); return; }
    try{
      await callApi('records.replace',{collection:'farmgo_attendance', id:todayAtt.id, value:{...todayAtt.value, checkOutTime:nowTime(), checkOutLat:loc.lat, checkOutLng:loc.lng}});
      await reloadRecords(); setMessage('تم تسجيل الخروج بنجاح');
    }catch(err){ setMessage(err instanceof Error?err.message:'تعذر تسجيل الخروج'); }
    finally{ setBusy(false); }
  }

  async function deleteAttendance(id:string){
    setBusy(true);
    try{ await callApi('records.delete',{collection:'farmgo_attendance', id}); await reloadRecords(); setMessage('تم حذف السجل'); setConfirmDeleteAtt(null); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر الحذف'); } finally{ setBusy(false); }
  }

  async function submitRequest(e:React.FormEvent){
    e.preventDefault(); if(!current) return; if(!reqReason.trim()){ setMessage('اكتب سبب الطلب'); return; }
    setBusy(true);
    try{ await callApi('records.create',{collection:'farmgo_requests', value:{employeeId:current.id, employeeName:current.name, type:reqType, date:reqDate, reason:reqReason.trim(), status:'pending', createdAt:new Date().toISOString()}, idempotency_key:`req-${current.id}-${reqDate}-${Date.now()}`}); await reloadRecords(); setReqReason(''); setMessage('تم إرسال الطلب'); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر إرسال الطلب'); } finally{ setBusy(false); }
  }
  async function decideRequest(id:string, status:'approved'|'rejected'){
    setBusy(true);
    try{ const r=requests.find(x=>x.id===id); if(!r) return; await callApi('records.replace',{collection:'farmgo_requests', id, value:{...r.value, status}}); await reloadRecords(); setMessage(status==='approved'?'تم قبول الطلب':'تم رفض الطلب'); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر تحديث الطلب'); } finally{ setBusy(false); }
  }

  async function submitNote(e:React.FormEvent){
    e.preventDefault(); if(!noteEmployee || !noteText.trim()){ setMessage('اختر الموظف واكتب النص'); return; }
    if(noteKind==='deduction' && (!noteAmount || Number(noteAmount)<=0)){ setMessage('أدخل مبلغ الخصم بالريال'); return; }
    setBusy(true);
    try{ const emp=users.find(u=>u.id===noteEmployee); await callApi('records.create',{collection:'farmgo_notes', value:{employeeId:noteEmployee, employeeName:emp?.value.name||'', kind:noteKind, amount:noteKind==='deduction'?Number(noteAmount):null, text:noteText.trim(), date:noteDate}, idempotency_key:`note-${noteEmployee}-${Date.now()}`}); await reloadRecords(); setNoteText(''); setNoteAmount(''); setMessage('تمت إضافة الملاحظة'); }catch(err){ setMessage(err instanceof Error?err.message:'تعذر الإضافة'); } finally{ setBusy(false); }
  }

  async function changeMyPassword(e:React.FormEvent){
    e.preventDefault(); if(!current) return; setMessage(null);
    if(newPass.length<4){ setMessage('كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل'); return; }
    if(newPass!==confirmPass){ setMessage('كلمة السر الجديدة غير متطابقة'); return; }
    setBusy(true);
    try{
      if(current.role==='admin'){
        if(oldPass!==adminPassword) throw new Error('كلمة السر الحالية غير صحيحة');
        if(adminRecId) await callApi('records.replace',{collection:'farmgo_admin', id:adminRecId, value:{password:newPass}});
        else { const created:any = await callApi('records.create',{collection:'farmgo_admin', value:{password:newPass}, idempotency_key:`admin-pass-${Date.now()}`}); setAdminRecId(created.id); }
        setAdminPassword(newPass);
      } else {
        const rec=users.find(u=>u.id===current.id); if(!rec) throw new Error('الحساب غير موجود');
        if(oldPass!==rec.value.password) throw new Error('كلمة السر الحالية غير صحيحة');
        await callApi('records.replace',{collection:'farmgo_users', id:current.id, value:{...rec.value, password:newPass}});
      }
      await reloadRecords(); setOldPass(''); setNewPass(''); setConfirmPass(''); setMessage('تم تغيير كلمة السر بنجاح');
    }catch(err){ setMessage(err instanceof Error?err.message:'تعذر تغيير كلمة السر'); } finally{ setBusy(false); }
  }

  const absences = useMemo(()=>{
    if(!current) return [];
    const out:{date:string; day:string}[]=[];
    for(let i=1;i<=7;i++){ const d=new Date(); d.setDate(d.getDate()-i); const ds=todayStr(d); const label = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()];
      if(current.workDays.includes(label) && !attendance.some(a=>a.value.employeeId===current.id && a.value.date===ds)) out.push({date:ds, day:label});
    }
    return out;
  },[current,attendance]);

  const settingsPanel = (
    <section className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 md:p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-black">إعدادات الاتصال</h2>
        <p className="text-[var(--muted)] font-bold mt-1">احفظ عنوان مشروعك ومفتاح النشر هنا. يُستخدم Publishable Key فقط — لا تدخل service_role أبداً.</p>
        <p className={`mt-3 rounded-2xl p-3 font-bold text-sm ${settingsComplete ? 'bg-[var(--green-light)]' : 'bg-[var(--amber-bg)]'}`}>{settingsComplete ? (settingsSaved ? 'تم حفظ إعدادات الاتصال.' : 'إعدادات الاتصال مكتملة.') : 'الوضع المحلي - أكمل إعدادات Supabase للحفظ على السيرفر'}</p>
        <p className="mt-3 font-bold text-sm leading-6">تُحفظ إعدادات الاتصال وكل عمليات FARMGO — إضافة موظف، دخول/خروج مع الموقع، خصومات، رواتب، طلبات — في قاعدة بيانات التطبيق. كل مستخدم يرى بيانات شركته فقط عبر user_id.</p>
      </div>
      <form onSubmit={saveSettings} className="space-y-4">
        <div><label className="label">Project URL</label><input className="field" type="url" dir="ltr" value={settingsUrl} onChange={e=>setSettingsUrl(e.target.value)} placeholder="https://tgpkjvimldijwcaqdmto.supabase.co" /></div>
        <div><label className="label">Publishable Key</label><input className="field" type="password" dir="ltr" autoComplete="off" value={settingsKey} onChange={e=>setSettingsKey(e.target.value)} placeholder="أدخل Publishable Key هنا" /></div>
        <button className="btn-primary w-full sm:w-auto" disabled={settingsBusy}>{settingsBusy?'جارٍ الحفظ…':'حفظ إعدادات الاتصال'}</button>
      </form>
      <div className="border-t border-[var(--line)] pt-4">
        <button className="btn-ghost" onClick={()=>setShowSql(!showSql)}>{showSql?'إخفاء كود SQL':'عرض كود SQL جاهز لإنشاء الجداول'}</button>
        {showSql && <><p className="font-bold text-sm mt-3 leading-6">حدّد النص التالي وانسخه إلى محرر SQL في مشروعك. يتضمن الجداول الأربعة وقواعد RLS بحيث يرى كل مستخدم ويضيف بياناته فقط عبر user_id.</p><textarea className="field mt-3" rows={14} dir="ltr" readOnly value={SUPABASE_SQL} style={{fontFamily:'ui-monospace, monospace', fontSize:13, lineHeight:1.6}} /></>}
      </div>
    </section>
  );

  if(loading) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center" dir="rtl"><p className="font-extrabold text-xl">جارٍ تحميل FARMGO…</p></div>;

  return (
    <div data-safe-area-inset-root style={{boxSizing:'border-box', paddingTop:'var(--safe-area-inset-top)'}} className="min-h-screen bg-[var(--bg)] text-[var(--ink)] overflow-x-clip" dir="rtl" lang="ar">
      <header data-safe-area-sticky-top style={{top:'var(--safe-area-inset-top)'}} className="sticky z-20 bg-[var(--surface)] border-b border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-[var(--green)] text-white flex items-center justify-center font-black text-xl">F</div>
            <div className="min-w-0">
              <h1 className="text-[clamp(2rem,6vw,3rem)] leading-none font-black tracking-tight text-[var(--green-dark)] [overflow-wrap:anywhere]">FARMGO</h1>
              <p className="text-sm font-bold text-[var(--muted)]">نظام دوام الموظفين</p>
            </div>
          </div>
          {current && <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-[var(--green-light)] text-[var(--green-dark)] rounded-full px-3 py-2 text-sm font-bold [overflow-wrap:anywhere]">{current.name} • {current.role==='admin'?'مدير':current.role==='supervisor'?'مشرف':'موظف'}</span>
            <button onClick={()=>{setCurrent(null); setMessage(null);}} className="btn-ghost flex items-center gap-1"><LogOut size={16}/> خروج</button>
          </div>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-14">
        {loadError && <div className="mb-4 bg-[var(--amber-bg)] border border-[var(--line)] rounded-2xl p-4 font-bold text-sm">تعذر الاتصال بالحفظ الدائم الآن. يمكنك تصفح الواجهة، وستظهر البيانات بعد عودة الاتصال.</div>}
        {message && <div className="mb-4 bg-[var(--green-light)] border border-[var(--line)] rounded-2xl px-4 py-3 font-bold text-sm flex justify-between gap-3"><span className="[overflow-wrap:anywhere]">{message}</span><button onClick={()=>setMessage(null)} className="font-black">×</button></div>}

        {!current ? (
          <div className="grid md:grid-cols-2 gap-5 items-start">
            <section className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-6 md:p-8">
              <div className="flex items-center gap-2 text-[var(--green)] font-extrabold"><ShieldCheck size={20}/> دخول</div>
              <h2 className="text-2xl font-black mt-2">أهلاً بك في FARMGO</h2>
              <p className="text-[var(--muted)] font-bold mt-1">سجّل دخولك بحسابك لمتابعة دوامك وطلباتك.</p>
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div><label className="label">الإيميل</label><input className="field" type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="name@company.com" /></div>
                <div><label className="label">كلمة السر</label><input className="field" type="password" required value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="••••••" /></div>
                {loginError && <p className="text-[#b42318] font-bold text-sm">{loginError}</p>}
                <button className="btn-primary w-full" disabled={loginBusy}>{loginBusy?'جارٍ الدخول…':'دخول'}</button>
              </form>
              <div className="mt-5 bg-[var(--green-light)] rounded-2xl p-4 text-sm font-bold leading-6">دخول المدير الأول:<br/>الإيميل: admin@company.com<br/>كلمة السر: 123456</div>
              {!settingsComplete && <div className="mt-4 bg-[var(--amber-bg)] rounded-2xl p-4 text-sm font-bold leading-6">الوضع المحلي - أكمل إعدادات Supabase للحفظ على السيرفر</div>}
              <button type="button" className="btn-ghost w-full mt-4" onClick={()=>setShowSettings(!showSettings)}>{showSettings?'إخفاء إعدادات الاتصال':'إعدادات الاتصال'}</button>
            </section>
            {showSettings && <div>{settingsPanel}</div>}
            <section className="bg-[var(--green)] text-white rounded-3xl p-6 md:p-8">
              <h2 className="text-2xl font-black leading-snug">دوام أوضح لكل فريق</h2>
              <p className="mt-2 text-white/90 font-bold leading-7">تسجيل دخول وخروج بالموقع، وجدول دوام واحد للمدير والمشرف، وطلبات أعذار منظمة، وملاحظات وخصومات موثقة لكل موظف.</p>
              <ul className="mt-5 space-y-3 font-bold">
                <li className="flex gap-2"><Clock size={20}/> دخول وخروج بالموقع من المتصفح</li>
                <li className="flex gap-2"><CalendarDays size={20}/> أيام دوام خاصة بكل موظف</li>
                <li className="flex gap-2"><FileText size={20}/> طلبات عذر وغياب بقبول أو رفض</li>
                <li className="flex gap-2"><Wallet size={20}/> ملاحظات وخصومات بالريال السعودي</li>
              </ul>
            </section>
          </div>
        ) : (
          <>
            <nav className="flex gap-2 flex-wrap mb-5" aria-label="أقسام البرنامج">
              {current.role==='admin' && <><button className={`tab ${tab==='settings'?'active':''}`} onClick={()=>setTab('settings')}><span className="flex gap-1 items-center"><ShieldCheck size={16}/> إعدادات الاتصال</span></button><button className={`tab ${tab==='employees'?'active':''}`} onClick={()=>{setTab('employees'); setDetailId(null);}}><span className="flex gap-1 items-center"><Users size={16}/> الموظفون والمشرفون</span></button><button className={`tab ${tab==='attendance'?'active':''}`} onClick={()=>setTab('attendance')}><span className="flex gap-1 items-center"><Clock size={16}/> جدول الدوام</span></button><button className={`tab ${tab==='requests'?'active':''}`} onClick={()=>setTab('requests')}><span className="flex gap-1 items-center"><FileText size={16}/> طلبات الأعذار</span></button><button className={`tab ${tab==='notes'?'active':''}`} onClick={()=>setTab('notes')}><span className="flex gap-1 items-center"><Wallet size={16}/> الملاحظات والخصومات</span></button><button className={`tab ${tab==='reports'?'active':''}`} onClick={()=>setTab('reports')}><span className="flex gap-1 items-center"><Download size={16}/> التقارير</span></button><button className={`tab ${tab==='salaries'?'active':''}`} onClick={()=>setTab('salaries')}><span className="flex gap-1 items-center"><Wallet size={16}/> الرواتب</span></button><button className={`tab ${tab==='profile'?'active':''}`} onClick={()=>setTab('profile')}><span className="flex gap-1 items-center"><KeyRound size={16}/> ملفي</span></button></>}
              {current.role==='supervisor' && <><button className={`tab ${tab==='attendance'?'active':''}`} onClick={()=>setTab('attendance')}><span className="flex gap-1 items-center"><Clock size={16}/> جدول الدوام</span></button><button className={`tab ${tab==='requests'?'active':''}`} onClick={()=>setTab('requests')}><span className="flex gap-1 items-center"><FileText size={16}/> طلبات الأعذار</span></button><button className={`tab ${tab==='notes'?'active':''}`} onClick={()=>setTab('notes')}><span className="flex gap-1 items-center"><Wallet size={16}/> الملاحظات والخصومات</span></button><button className={`tab ${tab==='reports'?'active':''}`} onClick={()=>setTab('reports')}><span className="flex gap-1 items-center"><Download size={16}/> التقارير</span></button><button className={`tab ${tab==='profile'?'active':''}`} onClick={()=>setTab('profile')}><span className="flex gap-1 items-center"><KeyRound size={16}/> ملفي</span></button></>}
              {current.role==='employee' && <><button className={`tab ${tab==='my'?'active':''}`} onClick={()=>setTab('my')}><span className="flex gap-1 items-center"><Clock size={16}/> دوامي</span></button><button className={`tab ${tab==='requests'?'active':''}`} onClick={()=>setTab('requests')}><span className="flex gap-1 items-center"><FileText size={16}/> طلباتي</span></button><button className={`tab ${tab==='profile'?'active':''}`} onClick={()=>setTab('profile')}><span className="flex gap-1 items-center"><KeyRound size={16}/> ملفي</span></button></>}
            </nav>

            {/* EMPLOYEES - admin only */}
            {current.role==='admin' && tab==='employees' && (
              <section className="space-y-5">
                {detailUser ? (
                  <div className="space-y-5">
                    <button className="btn-ghost flex items-center gap-1" onClick={()=>setDetailId(null)}><ArrowRight size={16}/> عودة إلى قائمة الموظفين</button>
                    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 md:p-6">
                      <h2 className="text-2xl font-black [overflow-wrap:anywhere]">تفاصيل الموظف — {detailUser.value.name}</h2>
                      <div className="grid sm:grid-cols-2 gap-3 mt-4 font-bold text-sm leading-7">
                        <p className="[overflow-wrap:anywhere]">الإيميل: {detailUser.value.email}</p>
                        <p>الجوال: {detailUser.value.phone||'—'}</p>
                        <p>الوظيفة: {detailUser.value.job||'—'} • القسم: {detailUser.value.department||'—'}</p>
                        <p>الدور: {detailUser.value.role==='supervisor'?'مشرف':'موظف'}</p>
                        <p>بداية الدوام: {detailUser.value.shiftStart} — نهاية الدوام: {detailUser.value.shiftEnd}</p>
                        <p>الراتب الشهري: {Number(detailUser.value.salary||0)} ر.س</p>
                      </div>
                      <p className="font-bold text-sm mt-2">أيام الدوام: {detailUser.value.workDays.join(' ، ')}</p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <button className="btn-ghost flex gap-1 items-center" onClick={()=>{ setUserForm({...detailUser.value, salary:Number(detailUser.value.salary||0)}); setEditingId(detailUser.id); setShowUserForm(true); setDetailId(null); window.scrollTo({top:0,behavior:'smooth'}); }}><Pencil size={15}/> تعديل بيانات الموظف والراتب</button>
                      </div>
                    </div>
                    <PerformanceAnalysis employeeId={detailUser.id} employeeName={detailUser.value.name} workDays={detailUser.value.workDays} shiftStart={detailUser.value.shiftStart} attendance={attendance} notes={notes} />
                    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><h3 className="font-black text-lg">آخر سجلات الدوام</h3>{attendance.filter(a=>a.value.employeeId===detailUser.id).sort((a,b)=>b.value.date.localeCompare(a.value.date)).slice(0,7).length===0?<p className="font-bold text-[var(--muted)] mt-3">لا توجد سجلات بعد.</p>:<ul className="mt-3 space-y-2">{attendance.filter(a=>a.value.employeeId===detailUser.id).sort((a,b)=>b.value.date.localeCompare(a.value.date)).slice(0,7).map(a=><li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2 font-bold text-sm"><span>{a.value.date}</span><span>دخول {a.value.checkInTime||'—'} • خروج {a.value.checkOutTime||'—'}</span></li>)}</ul>}</div>
                  </div>
                ) : (
                  <>
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div><h2 className="text-2xl font-black">الموظفون والمشرفون</h2><p className="text-[var(--muted)] font-bold">أضف مشرفاً أو موظفاً، وحدد دوامه الخاص به.</p></div>
                  <button className="btn-primary flex items-center gap-1" onClick={()=>{ setShowUserForm(!showUserForm); if(showUserForm) resetUserForm(); }}><Plus size={18}/> {showUserForm?'إغلاق النموذج':'إضافة شخص'}</button>
                </div>
                {showUserForm && (
                  <form onSubmit={saveUser} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 grid sm:grid-cols-2 gap-4">
                    <div><label className="label">الاسم *</label><input className="field" required value={userForm.name} onChange={e=>setUserForm({...userForm,name:e.target.value})} /></div>
                    <div><label className="label">الإيميل *</label><input className="field" type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})} /></div>
                    <div><label className="label">الجوال</label><input className="field" inputMode="tel" value={userForm.phone} onChange={e=>setUserForm({...userForm,phone:e.target.value})} /></div>
                    <div><label className="label">الوظيفة</label><input className="field" value={userForm.job} onChange={e=>setUserForm({...userForm,job:e.target.value})} placeholder="مثال: عامل مزرعة" /></div>
                    <div><label className="label">القسم</label><input className="field" value={userForm.department} onChange={e=>setUserForm({...userForm,department:e.target.value})} placeholder="مثال: الإنتاج" /></div>
                    <div><label className="label">الدور</label><select className="field" value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value as any})}><option value="employee">موظف</option><option value="supervisor">مشرف</option></select></div>
                    <div><label className="label">بداية الدوام</label><input className="field" type="time" value={userForm.shiftStart} onChange={e=>setUserForm({...userForm,shiftStart:e.target.value})} /></div>
                    <div><label className="label">نهاية الدوام</label><input className="field" type="time" value={userForm.shiftEnd} onChange={e=>setUserForm({...userForm,shiftEnd:e.target.value})} /></div>
                    <div><label className="label">الراتب الشهري بالريال السعودي</label><input className="field" type="number" min="0" step="1" value={userForm.salary||''} onChange={e=>setUserForm({...userForm,salary:Number(e.target.value)||0})} placeholder="مثال: 4000" /></div>
                    <div className="sm:col-span-2"><span className="label">أيام الدوام</span><div className="flex flex-wrap gap-2">{DAYS.map(d=><button type="button" key={d} className={`chip ${userForm.workDays.includes(d)?'active':''}`} onClick={()=>setUserForm({...userForm, workDays: userForm.workDays.includes(d)? userForm.workDays.filter(x=>x!==d): [...userForm.workDays,d]})}>{d}</button>)}</div></div>
                    <div className="sm:col-span-2"><label className="label">{editingId?'كلمة سر جديدة (اتركها فارغة للإبقاء على الحالية)':'كلمة سر أولية *'}</label><input className="field" type="password" required={!editingId} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} /></div>
                    <div className="sm:col-span-2 flex gap-2"><button className="btn-primary flex-1" disabled={busy}>{busy?'جارٍ الحفظ…': editingId?'حفظ التعديل':'إضافة'}</button><button type="button" className="btn-ghost" onClick={()=>{setShowUserForm(false); resetUserForm();}}>إلغاء</button></div>
                  </form>
                )}
                <div className="relative"><Search className="absolute right-3 top-3 text-[var(--muted)]" size={18}/><input className="field pr-10" placeholder="ابحث بالاسم أو الإيميل أو القسم أو الوظيفة" value={userSearch} onChange={e=>setUserSearch(e.target.value)} /></div>
                {filteredUsers.length===0 ? <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-3xl p-8 text-center"><p className="font-black text-lg">لا يوجد أشخاص بعد</p><p className="text-[var(--muted)] font-bold mt-1">اضغط «إضافة شخص» لإضافة أول مشرف أو موظف.</p></div> : (
                  <div className="grid md:grid-cols-2 gap-4">{filteredUsers.map(u=>(
                    <article key={u.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5">
                      <div className="flex justify-between gap-3"><div><h3 className="font-black text-lg [overflow-wrap:anywhere]">{u.value.name}</h3><p className="text-sm font-bold text-[var(--muted)] [overflow-wrap:anywhere]">{u.value.role==='supervisor'?'مشرف':'موظف'} • {u.value.job} • {u.value.department}</p></div><span className="bg-[var(--green-light)] rounded-full px-3 py-1 text-xs font-black h-fit whitespace-nowrap">{u.value.shiftStart} - {u.value.shiftEnd}</span></div>
                      <p className="mt-3 text-sm font-bold leading-6 [overflow-wrap:anywhere]">{u.value.email}<br/>{u.value.phone||'—'}</p>
                      <p className="mt-2 text-sm font-bold text-[var(--muted)]">أيام الدوام: {u.value.workDays.join(' ، ')}</p>
                      <p className="mt-1 text-sm font-bold">الراتب الشهري: {Number(u.value.salary||0)} ر.س</p>
                      {setPassId===u.id ? <div className="mt-4 bg-[var(--green-light)] rounded-2xl p-3 flex flex-wrap gap-2"><input className="field flex-1 min-w-[150px]" type="password" placeholder="كلمة سر جديدة" value={setPassValue} onChange={e=>setSetPassValue(e.target.value)} /><button className="btn-primary" onClick={setPasswordForUser} disabled={busy}>تعيين</button><button className="btn-ghost" onClick={()=>{setSetPassId(null); setSetPassValue('');}}>إلغاء</button></div> : null}
                      {confirmDeleteUser===u.id ? <div className="mt-4 bg-[#fff5f3] border border-[#f0c5c0] rounded-2xl p-3"><p className="font-bold text-sm">حذف {u.value.name}؟ لا يمكن التراجع.</p><div className="flex gap-2 mt-2"><button className="btn-danger" onClick={()=>deleteUser(u.id)} disabled={busy}>نعم، حذف</button><button className="btn-ghost" onClick={()=>setConfirmDeleteUser(null)}>إلغاء</button></div></div> : null}
                      <div className="flex flex-wrap gap-2 mt-4">
                        <button className="btn-ghost flex gap-1 items-center" onClick={()=>setDetailId(u.id)}><BarChart3 size={15}/> تفاصيل وتحليل</button>
                        <button className="btn-ghost flex gap-1 items-center" onClick={()=>{ setUserForm({...u.value, salary:Number(u.value.salary||0)}); setEditingId(u.id); setShowUserForm(true); window.scrollTo({top:0,behavior:'smooth'}); }}><Pencil size={15}/> تعديل</button>
                        <button className="btn-ghost flex gap-1 items-center" onClick={()=>{setSetPassId(u.id); setSetPassValue('');}}><KeyRound size={15}/> تعيين كلمة سر</button>
                        <button className="btn-danger flex gap-1 items-center" onClick={()=>setConfirmDeleteUser(u.id)}><Trash2 size={15}/> حذف</button>
                      </div>
                    </article>
                  ))}</div>
                )}
                  </>
                )}
              </section>
            )}

            {current.role==='admin' && tab==='settings' && settingsPanel}
            {!settingsComplete && <div className="mb-4 bg-[var(--amber-bg)] border border-[var(--line)] rounded-2xl p-4 font-bold text-sm">الوضع المحلي - أكمل إعدادات Supabase للحفظ على السيرفر</div>}

            {/* REPORTS / EXPORT */}
            {(current.role==='admin'||current.role==='supervisor') && tab==='reports' && (
              <section className="space-y-5">
                <div><h2 className="text-2xl font-black">التقارير</h2><p className="text-[var(--muted)] font-bold">صدّر سجل الدوام والخصومات لفترتك المختارة.</p></div>
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 md:p-6 space-y-4">
                  <h3 className="font-black text-lg flex gap-2 items-center"><Download size={18} className="text-[var(--green)]"/> تصدير إكسل</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="label">من تاريخ</label><input type="date" className="field" value={repFrom} onChange={e=>setRepFrom(e.target.value)} /></div>
                    <div><label className="label">إلى تاريخ</label><input type="date" className="field" value={repTo} onChange={e=>setRepTo(e.target.value)} /></div>
                    <div><label className="label">الموظف</label><select className="field" value={repEmployee} onChange={e=>setRepEmployee(e.target.value)}><option value="all">الكل</option>{users.map(u=><option key={u.id} value={u.id}>{u.value.name} — {u.value.role==='supervisor'?'مشرف':'موظف'}</option>)}</select></div>
                    <div><label className="label">نوع التصدير</label><select className="field" value={repType} onChange={e=>setRepType(e.target.value as any)}><option value="attendance">سجل الدوام فقط</option><option value="deductions">الخصومات فقط</option><option value="both">الدوام + الخصومات معاً</option></select></div>
                  </div>
                  <div className="bg-[var(--green-light)] rounded-2xl p-4 font-bold text-sm leading-6">في الفترة المختارة: {exportPreview.att} سجل دوام • {exportPreview.ded} خصم.<br/>أعمدة الملف: الاسم، الإيميل، التاريخ، وقت الدخول، موقع الدخول برابط خرائط جوجل، وقت الخروج، موقع الخروج برابط خرائط جوجل، التأخير بالدقائق، نوع الخصم/الملاحظة، مبلغ الخصم بالريال السعودي، السبب.</div>
                  {exportMsg && <p className="font-bold text-sm">{exportMsg}</p>}
                  <button className="btn-primary flex gap-2 items-center justify-center w-full sm:w-auto" onClick={handleExport}><Download size={18}/> تنزيل ملف إكسل</button>
                  <p className="text-xs font-bold text-[var(--muted)]">يُحفظ الملف بترميز UTF-8 مع BOM ليظهر بالعربية بشكل صحيح عند فتحه في إكسل.</p>
                </div>
              </section>
            )}

            {/* SALARIES - admin only */}
            {current.role==='admin' && tab==='salaries' && (
              <section className="space-y-5">
                <div className="flex flex-wrap gap-3 justify-between items-end"><div><h2 className="text-2xl font-black">الرواتب</h2><p className="text-[var(--muted)] font-bold">صافي الراتب = الراتب الأساسي − إجمالي الخصومات في الشهر المختار.</p></div><div><label className="label">الشهر</label><input type="month" className="field" value={salaryMonth} onChange={e=>setSalaryMonth(e.target.value)} /></div></div>
                <p className="font-bold text-sm">الشهر المعروض: {monthLabel(salaryMonth)}</p>
                {salaryRows.length===0 ? <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-3xl p-8 text-center font-bold">لا يوجد موظفون بعد. أضف موظفاً من صفحة الموظفين.</div> : (
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-right text-sm">
                      <thead><tr className="bg-[var(--green-light)] font-black"><th className="p-3">الموظف</th><th className="p-3">الراتب الأساسي (ر.س)</th><th className="p-3">إجمالي الخصومات</th><th className="p-3">صافي الراتب</th><th className="p-3">أيام الحضور</th><th className="p-3">أيام الغياب</th><th className="p-3">حفظ الراتب</th></tr></thead>
                      <tbody>{salaryRows.map(r=>{
                        const draft = salaryDrafts[r.id];
                        const shown = draft!==undefined ? draft : String(r.base);
                        const changed = draft!==undefined && Number(draft)!==r.base;
                        return <tr key={r.id} className="border-t border-[var(--line)] align-top"><td className="p-3 font-black [overflow-wrap:anywhere]">{r.name}<div className="text-xs font-bold text-[var(--muted)]">{r.job||''}</div></td><td className="p-3"><input className="field !py-2 w-[130px]" type="number" min="0" step="1" value={shown} onChange={e=>setSalaryDrafts(prev=>({...prev,[r.id]:e.target.value}))} /></td><td className="p-3 font-bold text-[#b42318]">{r.dedTotal} ر.س</td><td className="p-3 font-black">{r.net} ر.س</td><td className="p-3 font-bold">{r.attended}</td><td className="p-3 font-bold">{r.absent}</td><td className="p-3"><button className="btn-primary !py-2 !px-3" disabled={!changed||busy} onClick={()=>saveSalary(r.id)}>حفظ</button></td></tr>
                      })}</tbody></table></div>
                  </div>
                )}
                <p className="text-xs font-bold text-[var(--muted)]">يمكنك تعديل الراتب في أي وقت من هنا أو من ملف الموظف، وسيُحفظ للشهور القادمة. أيام الغياب تُحسب من أيام الدوام المقررة للموظف في الشهر المختار بدون سجل حضور.</p>
              </section>
            )}

            {/* ATTENDANCE TABLE - admin/supervisor */}
            {(current.role==='admin'||current.role==='supervisor') && tab==='attendance' && (
              <section className="space-y-4">
                <div className="flex flex-wrap gap-3 justify-between items-end"><div><h2 className="text-2xl font-black">جدول الدوام</h2><p className="text-[var(--muted)] font-bold">التأخير يُحسب من بداية دوام كل موظف.</p></div><div><label className="label">التاريخ</label><input type="date" className="field" value={attDate} onChange={e=>setAttDate(e.target.value)} /></div></div>
                {filteredAttendance.length===0 ? <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-3xl p-8 text-center font-bold">لا توجد سجلات في هذا التاريخ.</div> : (
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-right text-sm">
                      <thead><tr className="bg-[var(--green-light)] font-black"><th className="p-3">الموظف</th><th className="p-3">وقت الدخول</th><th className="p-3">موقع الدخول</th><th className="p-3">وقت الخروج</th><th className="p-3">موقع الخروج</th><th className="p-3">التأخير</th><th className="p-3">حذف</th></tr></thead>
                      <tbody>{filteredAttendance.map(a=>{
                        const late=lateMinutes(a.value.shiftStart, a.value.checkInTime);
                        const inUrl=mapsUrl(a.value.checkInLat,a.value.checkInLng); const outUrl=mapsUrl(a.value.checkOutLat,a.value.checkOutLng);
                        return <tr key={a.id} className="border-t border-[var(--line)] align-top"><td className="p-3 font-black [overflow-wrap:anywhere]">{a.value.employeeName}<div className="text-xs font-bold text-[var(--muted)]">بداية الدوام {a.value.shiftStart}</div></td><td className="p-3 font-bold">{a.value.checkInTime||'—'}</td><td className="p-3">{inUrl? <><span className="block font-bold">{shortLoc(a.value.checkInLat,a.value.checkInLng)}</span><a className="text-[var(--green)] font-black underline" href={inUrl} target="_blank" rel="noopener">فتح في خرائط جوجل</a></>: '—'}</td><td className="p-3 font-bold">{a.value.checkOutTime||'—'}</td><td className="p-3">{outUrl? <><span className="block font-bold">{shortLoc(a.value.checkOutLat,a.value.checkOutLng)}</span><a className="text-[var(--green)] font-black underline" href={outUrl} target="_blank" rel="noopener">فتح في خرائط جوجل</a></>: '—'}</td><td className="p-3"><span className={`rounded-full px-2 py-1 font-black text-xs ${late>0?'bg-[var(--amber-bg)] text-[var(--amber)]':'bg-[var(--green-light)] text-[var(--green-dark)]'}`}>{late===0?'بدون تأخير':`${late} دقيقة`}</span></td><td className="p-3">{confirmDeleteAtt===a.id? <div className="min-w-[130px]"><p className="font-bold text-xs">حذف هذا السجل؟</p><div className="flex gap-1 mt-1"><button className="btn-danger !py-1 !px-2 text-xs" onClick={()=>deleteAttendance(a.id)}>نعم</button><button className="btn-ghost !py-1 !px-2 text-xs" onClick={()=>setConfirmDeleteAtt(null)}>لا</button></div></div> : <button className="btn-danger" onClick={()=>setConfirmDeleteAtt(a.id)}><Trash2 size={16}/></button>}</td></tr>
                      })}</tbody></table></div>
                  </div>
                )}
              </section>
            )}

            {/* REQUESTS */}
            {tab==='requests' && (
              <section className="space-y-5">
                <h2 className="text-2xl font-black">{current.role==='employee'?'طلباتي':'طلبات الأعذار'}</h2>
                {current.role==='employee' && <form onSubmit={submitRequest} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 grid sm:grid-cols-2 gap-4">
                  <div><label className="label">نوع الطلب</label><select className="field" value={reqType} onChange={e=>setReqType(e.target.value)}><option>عذر</option><option>غياب</option></select></div>
                  <div><label className="label">التاريخ</label><input type="date" className="field" value={reqDate} onChange={e=>setReqDate(e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="label">السبب</label><textarea className="field" rows={3} value={reqReason} onChange={e=>setReqReason(e.target.value)} placeholder="اكتب سبب الطلب بوضوح" /></div>
                  <button className="btn-primary sm:col-span-2" disabled={busy}>إرسال الطلب</button>
                </form>}
                {(current.role==='employee'? myRequests : requests.slice().sort((a,b)=>b.value.date.localeCompare(a.value.date))).length===0 ? <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-3xl p-8 text-center font-bold">لا توجد طلبات بعد.</div> : (
                  <div className="grid md:grid-cols-2 gap-4">{(current.role==='employee'? myRequests : requests.slice().sort((a,b)=>b.value.date.localeCompare(a.value.date))).map(r=>(
                    <article key={r.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5">
                      <div className="flex justify-between gap-2"><h3 className="font-black [overflow-wrap:anywhere]">{r.value.employeeName} • {r.value.type}</h3><span className={`rounded-full px-3 py-1 text-xs font-black h-fit whitespace-nowrap ${r.value.status==='approved'?'bg-[var(--green-light)] text-[var(--green-dark)]':r.value.status==='rejected'?'bg-[#fff5f3] text-[#b42318]':'bg-[var(--amber-bg)] text-[var(--amber)]'}`}>{r.value.status==='approved'?'مقبول':r.value.status==='rejected'?'مرفوض':'بانتظار القرار'}</span></div>
                      <p className="mt-2 font-bold text-sm">التاريخ: {r.value.date}</p><p className="mt-1 font-bold text-sm leading-6 [overflow-wrap:anywhere]">{r.value.reason}</p>
                      {(current.role==='supervisor'||current.role==='admin') && r.value.status==='pending' && <div className="flex gap-2 mt-4"><button className="btn-primary flex gap-1 items-center !py-2" onClick={()=>decideRequest(r.id,'approved')} disabled={busy}><Check size={16}/> قبول</button><button className="btn-danger flex gap-1 items-center" onClick={()=>decideRequest(r.id,'rejected')} disabled={busy}><X size={16}/> رفض</button></div>}
                    </article>
                  ))}</div>
                )}
              </section>
            )}

            {/* NOTES */}
            {tab==='notes' && (
              <section className="space-y-5">
                <h2 className="text-2xl font-black">الملاحظات والخصومات</h2>
                {current.role==='admin' && <form onSubmit={submitNote} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 grid sm:grid-cols-2 gap-4">
                  <div><label className="label">الموظف</label><select className="field" value={noteEmployee} onChange={e=>setNoteEmployee(e.target.value)}><option value="">اختر موظفاً</option>{users.map(u=><option key={u.id} value={u.id}>{u.value.name} — {u.value.role==='supervisor'?'مشرف':'موظف'}</option>)}</select></div>
                  <div><label className="label">النوع</label><select className="field" value={noteKind} onChange={e=>setNoteKind(e.target.value as any)}><option value="note">ملاحظة</option><option value="deduction">خصم</option></select></div>
                  {noteKind==='deduction' && <div><label className="label">مبلغ الخصم بالريال السعودي</label><input className="field" type="number" min="1" step="1" value={noteAmount} onChange={e=>setNoteAmount(e.target.value)} placeholder="مثال: 100" /></div>}
                  <div><label className="label">التاريخ</label><input type="date" className="field" value={noteDate} onChange={e=>setNoteDate(e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className="label">النص</label><textarea className="field" rows={3} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="اكتب الملاحظة أو سبب الخصم" /></div>
                  <button className="btn-primary sm:col-span-2" disabled={busy}>إضافة</button>
                </form>}
                {notes.length===0 ? <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-3xl p-8 text-center font-bold">لا توجد ملاحظات أو خصومات بعد.</div> : (
                  <div className="grid md:grid-cols-2 gap-4">{notes.slice().sort((a,b)=>b.value.date.localeCompare(a.value.date)).map(n=>(
                    <article key={n.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><div className="flex justify-between gap-2"><h3 className="font-black [overflow-wrap:anywhere]">{n.value.employeeName}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${n.value.kind==='deduction'?'bg-[#fff5f3] text-[#b42318]':'bg-[var(--green-light)] text-[var(--green-dark)]'}`}>{n.value.kind==='deduction'?`خصم ${n.value.amount} ر.س`:'ملاحظة'}</span></div><p className="mt-2 font-bold text-sm">التاريخ: {n.value.date}</p><p className="mt-1 font-bold text-sm leading-6 [overflow-wrap:anywhere]">{n.value.text}</p></article>
                  ))}</div>
                )}
              </section>
            )}

            {/* EMPLOYEE MY */}
            {current.role==='employee' && tab==='my' && (
              <section className="space-y-5">
                <div className="bg-[var(--green)] text-white rounded-3xl p-5 md:p-6">
                  <div className="flex flex-wrap justify-between gap-3 items-start"><div><h2 className="text-2xl font-black">دوامي اليوم</h2><p className="font-bold text-white/90 mt-1">اليوم: {todayStr()} • دوامك: {current.shiftStart} - {current.shiftEnd}</p><p className="font-bold text-white/90">أيام دوامك: {current.workDays.join(' ، ')}</p></div><span className="bg-white text-[var(--green-dark)] rounded-full px-4 py-2 font-black text-sm">{todayAtt?.checkInTime? todayAtt.checkOutTime? 'تم تسجيل الدخول والخروج':'تم تسجيل الدخول':'لم تسجل الدخول بعد'}</span></div>
                  <div className="mt-4 bg-white/10 rounded-2xl p-4">
                    {todayAtt && <div className="grid sm:grid-cols-2 gap-3 font-bold text-sm"><p>وقت الدخول: {todayAtt.value.checkInTime||'—'}</p><p>وقت الخروج: {todayAtt.value.checkOutTime||'—'}</p>{todayAtt.value.checkInLat!=null && <p className="sm:col-span-2">موقع الدخول: <a className="underline font-black" href={mapsUrl(todayAtt.value.checkInLat,todayAtt.value.checkInLng)} target="_blank" rel="noopener">فتح في خرائط جوجل</a> — {shortLoc(todayAtt.value.checkInLat,todayAtt.value.checkInLng)}</p>}{todayAtt.value.checkOutLat!=null && <p className="sm:col-span-2">موقع الخروج: <a className="underline font-black" href={mapsUrl(todayAtt.value.checkOutLat,todayAtt.value.checkOutLng)} target="_blank" rel="noopener">فتح في خرائط جوجل</a> — {shortLoc(todayAtt.value.checkOutLat,todayAtt.value.checkOutLng)}</p>}</div>}
                    {geoStatus && <p className="mt-3 font-bold text-sm">{geoStatus}</p>}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {!todayAtt && <button className="bg-white text-[var(--green-dark)] rounded-xl px-5 py-3 font-black" onClick={handleCheckIn} disabled={busy}>{busy?'جارٍ التسجيل…':'تسجيل الدخول'}</button>}
                      {todayAtt && !todayAtt.value.checkOutTime && <button className="bg-white text-[var(--green-dark)] rounded-xl px-5 py-3 font-black" onClick={handleCheckOut} disabled={busy}>{busy?'جارٍ التسجيل…':'تسجيل الخروج'}</button>}
                      {todayAtt?.value.checkOutTime && <span className="bg-white/20 rounded-xl px-4 py-3 font-black">اكتمل دوام اليوم</span>}
                    </div>
                    <p className="text-xs font-bold text-white/80 mt-3">سيطلب المتصفح إذن الموقع عند التسجيل. اسمح بالموقع لتسجيل موقعك بدقة.</p>
                  </div>
                </div>

                <PerformanceAnalysis employeeId={current.id} employeeName={current.name} workDays={current.workDays} shiftStart={current.shiftStart} attendance={attendance} notes={notes} />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><h3 className="font-black text-lg flex gap-2 items-center"><CalendarDays size={18}/> دوامي السابق</h3>{myAttendance.length===0?<p className="font-bold text-[var(--muted)] mt-3">لا توجد سجلات بعد.</p>:<ul className="mt-3 space-y-2">{myAttendance.slice(0,7).map(a=><li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2 font-bold text-sm"><span>{a.value.date}</span><span>دخول {a.value.checkInTime||'—'} • خروج {a.value.checkOutTime||'—'}</span></li>)}</ul>}</div>
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><h3 className="font-black text-lg">الغياب في الأيام السبعة الماضية</h3>{absences.length===0?<p className="font-bold text-[var(--muted)] mt-3">لا يوجد غياب مسجل في الأيام السبعة الماضية.</p>:<ul className="mt-3 space-y-2">{absences.map((a,i)=><li key={i} className="font-bold text-sm border-b border-[var(--line)] pb-2">{a.date} — {a.day}</li>)}</ul>}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5"><h3 className="font-black text-lg">ملاحظاتي وخصوماتي</h3>{myNotes.length===0?<p className="font-bold text-[var(--muted)] mt-3">لا توجد ملاحظات.</p>:<ul className="mt-3 space-y-2">{myNotes.map(n=><li key={n.id} className="font-bold text-sm border-b border-[var(--line)] pb-2 [overflow-wrap:anywhere]">{n.value.date} — {n.value.kind==='deduction'?`خصم ${n.value.amount} ر.س — `:''}{n.value.text}</li>)}</ul>}</div>
              </section>
            )}

            {/* PROFILE */}
            {tab==='profile' && (
              <section className="max-w-xl bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 md:p-6">
                <h2 className="text-2xl font-black">ملفي</h2>
                <div className="mt-4 bg-[var(--green-light)] rounded-2xl p-4 font-bold leading-7 [overflow-wrap:anywhere]">الاسم: {current.name}<br/>الإيميل: {current.email}<br/>الدور: {current.role==='admin'?'مدير':current.role==='supervisor'?'مشرف':'موظف'}<br/>{current.role!=='admin' && <>الوظيفة: {current.job}<br/>القسم: {current.department}<br/>الدوام: {current.shiftStart} - {current.shiftEnd}<br/>أيام الدوام: {current.workDays.join(' ، ')}</>}</div>
                <form onSubmit={changeMyPassword} className="mt-5 space-y-4"><h3 className="font-black text-lg">تغيير كلمة السر</h3>
                  <div><label className="label">كلمة السر الحالية</label><input className="field" type="password" required value={oldPass} onChange={e=>setOldPass(e.target.value)} /></div>
                  <div><label className="label">كلمة السر الجديدة</label><input className="field" type="password" required value={newPass} onChange={e=>setNewPass(e.target.value)} /></div>
                  <div><label className="label">تأكيد كلمة السر الجديدة</label><input className="field" type="password" required value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} /></div>
                  <button className="btn-primary w-full" disabled={busy}>حفظ كلمة السر الجديدة</button>
                </form>
                <p className="mt-4 text-xs font-bold text-[var(--muted)] flex gap-1 items-center"><UserRound size={14}/> احتفظ بكلمة سرك في مكان آمن.</p>
              </section>
            )}
          </>
        )}
      </main>
      <footer className="border-t border-[var(--line)] py-5 text-center font-black text-[var(--green)]">FARMGO</footer>
    </div>
  );
}
