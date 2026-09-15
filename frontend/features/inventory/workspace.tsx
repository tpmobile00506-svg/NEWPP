'use client';
import {useState,useEffect,useCallback} from 'react';import {Package,LayoutDashboard,Upload,ArrowLeftRight,QrCode,BarChart3,Users,History,Plus,Search,Download,ChevronRight,ArrowUpDown,FileSpreadsheet,ShieldCheck,Coins,TriangleAlert,FileCheck2,ArrowRight,LogOut,RefreshCw,Pencil} from 'lucide-react';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';import {SidebarProvider,Sidebar,SidebarContent,SidebarHeader,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarInset,SidebarTrigger} from '@/components/ui/sidebar';import {Skeleton} from '@/components/ui/skeleton';import {Toaster,toast} from 'sonner';
import {Asset,Role,roles,conditions,headers11,money} from '@/shared/domain';import {exportWorkbook,reportHeaders} from '@/frontend/services/excel-export';import {Any,api,Badge,Pick,Empty,Metric,Pager,Activity} from '@/frontend/components/common';import {useAssetTools} from '@/frontend/hooks/use-asset-tools';import Editor from './editor';import ImportView from '@/frontend/features/imports/import-view';import Operations from '@/frontend/features/operations/operations';
const nav=[['overview','ภาพรวม',LayoutDashboard],['registry','ทะเบียนครุภัณฑ์',Package],['imports','นำเข้าข้อมูล',Upload],['requests','คำขอและการอนุมัติ',ArrowLeftRight],['stocktakes','ตรวจนับประจำปี',QrCode],['reports','รายงานและอายุใช้งาน',BarChart3],['audit','ประวัติการดำเนินงาน',History],['users','ผู้ใช้และสิทธิ์',Users]] as const;
export default function Workspace(){
 const [data,setData]=useState<Any|null>(null),[error,setError]=useState(''),[auth,setAuth]=useState(false),[view,setView]=useState('registry'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(''),[branch,setBranch]=useState('all'),[condition,setCondition]=useState('all'),[category,setCategory]=useState('all'),[lifecycle,setLifecycle]=useState('active'),[page,setPage]=useState(0),[sort,setSort]=useState<{key:keyof Asset;dir:number}>({key:'createdAt',dir:-1});
 const [modal,setModal]=useState<Any|null>(null),[selected,setSelected]=useState<Asset|null>(null),[formError,setFormError]=useState(''),[revision,setRevision]=useState(0);
 const [email, setEmail] = useState('admin@ksu.ac.th'), [password, setPassword] = useState('admin12345678'), [loggingIn, setLoggingIn] = useState(false);
 const reload=useCallback(async()=>{try{setData(await api());setError('');setAuth(false);}catch(e:any){setError(e.message);setAuth(e.status===401);}finally{setLoading(false);}},[]);
 const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const text = await res.text();
      let result: Any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = {};
      }
      if (!res.ok) {
        throw new Error(result.error || (res.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : `เข้าสู่ระบบไม่สำเร็จ (${res.status}): กรุณาตรวจสอบการตั้งค่า DATABASE_URL บน Vercel`));
      }
      await reload();
    } catch (err: any) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoggingIn(false);
    }
  };
  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setData(null);
    setAuth(true);
  };
 useEffect(()=>{reload();},[reload]);useEffect(()=>{setPage(0);},[search,branch,condition,category,lifecycle,view]);
 useEffect(()=>{if(data){const a=new URL(location.href).searchParams.get('asset');if(a)setSelected(data.assets.find((x:Asset)=>x.id===a)||null);}},[!!data]);
 const open=(kind:string,rest:Any={})=>{setFormError('');setModal({kind,token:crypto.randomUUID(),...rest});};
 const write=async(body:Any)=>{setBusy(true);setFormError('');try{const r=await api('',{token:modal?.token||crypto.randomUUID(),...body});await reload();setRevision(n=>n+1);setModal(null);setSelected(null);toast.success('บันทึกเรียบร้อยแล้ว');return r;}catch(e:any){setFormError(e.message);toast.error(e.message);return null;}finally{setBusy(false);}};
 useAssetTools(data?.assets||[],open);
 const switchView=(v:string)=>{setView(v);setSearch('');};
 const assets:Asset[]=data?.assets||[],active=assets.filter(a=>a.lifecycle==='active');
 const total=active.reduce((s,a)=>s+a.totalSatang,0),quantity=active.reduce((s,a)=>s+a.quantity,0),damaged=active.filter(a=>a.condition==='damaged').reduce((s,a)=>s+a.quantity,0),pending=data?.requests.filter((r:Any)=>r.status==='pending')||[];
 const editable=data&&['staff','admin'].includes(data.me.role);
 const filtered=assets.filter(a=>(lifecycle==='all'||a.lifecycle===lifecycle)&&(branch==='all'||a.branch===branch)&&(category==='all'||a.category===category)&&(condition==='all'||a.condition===condition)&&[a.code,a.name,a.serial,a.location,a.branch,a.groupName].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>{const av=a[sort.key]??'',bv=b[sort.key]??'';return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'th'))*sort.dir;});
 const branchTotals=Object.entries(active.reduce((s:Record<string,number>,a)=>{s[a.branch]=(s[a.branch]||0)+a.totalSatang;return s;},{})).sort((a,b)=>b[1]-a[1]);
 async function exportRows(rows:Asset[]){setBusy(true);try{await exportWorkbook(rows);toast.success('ส่งออก Excel เรียบร้อยแล้ว');}catch(e:any){toast.error(e.message);}finally{setBusy(false);}}
 if(loading)return <div className="loading-box"><Package size={36}/><h1 className="my-6">ทะเบียนครุภัณฑ์</h1><Skeleton className="h-14 w-full mb-4"/><Skeleton className="h-40 w-full"/><p className="mt-5">กำลังเชื่อมต่อทะเบียนกลาง…</p></div>;
 if(!data)return <div className="loading-box panel" style={{ maxWidth: '440px', margin: '80px auto', padding: '32px' }}>
    <div className="brand" style={{ padding: '0 0 20px 0', borderBottom: '1px solid #dfe5ef', marginBottom: '20px' }}>
      <div className="brand-icon"><Package size={28} color="#fff"/></div>
      <div>
        <strong style={{ fontSize: '18px', display: 'block' }}>ระบบบริหารจัดการครุภัณฑ์</strong>
        <small style={{ color: '#60718b' }}>คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</small>
      </div>
    </div>
    {error && <div className="error mb-4">{error}</div>}
    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ fontSize: '13px', color: '#51647f', display: 'block', marginBottom: '6px' }}>อีเมล / บัญชีผู้ใช้</label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@ksu.ac.th" required />
      </div>
      <div>
        <label style={{ fontSize: '13px', color: '#51647f', display: 'block', marginBottom: '6px' }}>รหัสผ่าน</label>
        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
      </div>
      <Button type="submit" disabled={loggingIn} style={{ width: '100%', marginTop: '6px' }}>
        {loggingIn ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </Button>
    </form>
    <div style={{ marginTop: '16px', fontSize: '12px', color: '#8899ac', textAlign: 'center' }}>
      เข้าใช้งานครั้งแรก ระบบจะกำหนดบัญชีนี้เป็น <b>Admin</b> ทันที
    </div>
  </div>;
 const heading=nav.find(x=>x[0]===view)?.[1];
  return <SidebarProvider style={{'--sidebar-width':'252px'} as React.CSSProperties}><Sidebar><SidebarHeader className="p-0"><div className="brand"><div className="brand-icon"><Package size={24}/></div><div><strong>ครุภัณฑ์</strong><small>KSU · ASSET MANAGEMENT</small></div></div></SidebarHeader><SidebarContent className="px-3"><div className="nav-caption">พื้นที่ทำงาน</div><SidebarMenu>{nav.filter(x=>x[0]!=='users'||data.me.role==='admin').map(([key,label,Icon])=><SidebarMenuItem key={key}><SidebarMenuButton className="nav-item" isActive={view===key} onClick={()=>switchView(key)}><Icon/><span>{label}</span>{key==='requests'&&pending.length>0&&<span className="ml-auto text-xs">{pending.length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="mt-auto p-4"><div className="text-xs text-slate-400 mb-2">มาตรฐานทะเบียน</div><div className="flex gap-2 items-center text-sm"><ShieldCheck size={17}/>10 คอลัมน์ · ตรวจสอบย้อนหลัง</div></div></SidebarContent><SidebarFooter className="sidebar-footer"><b>มหาวิทยาลัยกาฬสินธุ์</b>คณะวิศวกรรมศาสตร์และ<br/>เทคโนโลยีอุตสาหกรรม</SidebarFooter></Sidebar>
  <SidebarInset className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger/><b>ทะเบียนกลาง</b><ChevronRight size={14} className="text-slate-400"/><small className="faculty">{heading}</small></div><div className="identity"><span className="avatar">{data.me.name.slice(0,1).toUpperCase()}</span><div>{data.me.name}<small>{roles[data.me.role as Role]}</small></div><Button variant="ghost" size="icon" onClick={handleLogout} aria-label="ออกจากระบบ"><LogOut size={17}/></Button></div></header>
  <main className="workspace"><div className="page-heading"><div><div className="eyebrow">คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</div><h1>{heading}</h1><p>{({registry:'ทะเบียนมาตรฐาน 10 คอลัมน์ เชื่อมโยงรายการกับข้อมูลต้นฉบับ',overview:'สถานะครุภัณฑ์และรายการที่รอดำเนินการ',imports:'ตรวจสอบข้อมูลจาก Excel ก่อนเพิ่มเข้าสู่ทะเบียนกลาง',requests:'ติดตามคำขอตามลำดับการอนุมัติ',stocktakes:'ตรวจสอบรายการจริงและเก็บผลแยกตามปีงบประมาณ',reports:'มูลค่า สถานะ และอายุใช้งานจากรายการในทะเบียน',users:'กำหนดสิทธิ์การทำงานให้ผู้ใช้ทั้ง 5 กลุ่ม',audit:'ผู้ดำเนินการ เวลา และรายละเอียดการเปลี่ยนแปลง'} as Any)[view]}</p></div><div className="actions">{view==='registry'&&<><Button variant="outline" disabled={busy||!filtered.length} onClick={()=>exportRows(filtered)}><Download size={16}/>ส่งออก Excel</Button>{editable&&<Button onClick={()=>open('create')}><Plus size={17}/>เพิ่มครุภัณฑ์</Button>}</>}{view==='stocktakes'&&editable&&<Button onClick={()=>open('round')}><Plus size={17}/>เปิดรอบตรวจนับ</Button>}{view==='users'&&<Button onClick={()=>open('user')}><Plus size={17}/>เพิ่มผู้ใช้</Button>}</div></div>{error&&<div className="error">{error}</div>}
  {['registry','overview','reports'].includes(view)&&<div className="metric-grid"><Metric label="รายการในทะเบียน" value={active.length.toLocaleString('th-TH')} note={quantity.toLocaleString('th-TH')+' หน่วย · เฉพาะรายการที่ยังถือครอง'} icon={Package}/><Metric label="มูลค่าครุภัณฑ์" value={money(total)} note="บาท · มูลค่าทุนตามทะเบียน" icon={Coins}/><Metric label="ครุภัณฑ์ชำรุด" value={damaged.toLocaleString('th-TH')} note="หน่วย · ยังรวมในมูลค่าที่ถือครอง" icon={TriangleAlert}/><Metric label="รอการอนุมัติ" value={pending.length} note="คำขอโอนย้าย ซ่อม และจำหน่าย" icon={FileCheck2}/></div>}
  {['registry','overview'].includes(view)&&!active.length&&<div className="import-banner"><FileSpreadsheet size={34}/><div><b>ไฟล์ต้นฉบับพร้อมตรวจสอบแล้ว</b><p>Excel ปีงบประมาณ 2569 · 18 ชีต · 4,312 แถวต้นทาง</p></div><Button onClick={()=>switchView('imports')}>ตรวจสอบและนำเข้า<ArrowRight size={16}/></Button></div>}
  {view==='registry'&&<div className="panel"><div className="panel-head"><h2>รายการครุภัณฑ์ <span className="badge ml-2">{filtered.length}</span></h2><div className="actions"><Button variant="outline" size="sm" disabled={busy||!filtered.length} onClick={()=>exportRows(filtered)}><Download size={15}/>ส่งออก Excel</Button>{editable&&<Button variant="ghost" size="sm" disabled={!filtered.length} onClick={()=>open('qr',{assets:filtered.filter(a=>a.lifecycle==='active')})}><QrCode size={16}/>พิมพ์ QR</Button>}<Button variant="ghost" size="sm" onClick={reload} aria-label="รีเฟรชทะเบียน"><RefreshCw size={16}/></Button></div></div><div className="toolbar"><div className="searchbox"><Search/><Input aria-label="ค้นหาครุภัณฑ์" placeholder="ค้นหาหมายเลข ชื่อ หรือ Serial…" value={search} onChange={e=>setSearch(e.target.value)}/></div><Pick label="สาขา" value={branch} onChange={setBranch} options={[['all','ทุกสาขา'],...Array.from(new Set(assets.map(x=>x.branch))).map(x=>[x,x] as [string,string])]}/><Pick label="สถานะ" value={condition} onChange={setCondition} options={[['all','ทุกสถานะ'],...Object.entries(conditions)]}/><Pick label="ประเภท" value={category} onChange={setCategory} options={[['all','ทุกประเภท'],...Array.from(new Set(assets.map(x=>x.category))).map(x=>[x,x] as [string,string])]}/><Pick label="ทะเบียน" value={lifecycle} onChange={setLifecycle} options={[['active','ทะเบียนที่ถือครอง'],['disposed','จำหน่ายแล้ว'],['split','ประวัติการแบ่ง'],['all','ทั้งหมดรวมประวัติ']]}/></div>
  {filtered.length?<><Table className="asset-table"><TableHeader><TableRow>{reportHeaders.map(h=>h==='หมวด (กลุ่มต่างๆ)'?'หมวด (กลุ่ม)':h).map((label,i)=>{const isNum=[3,4,5].includes(i);const isCenter=i===0;const sortKeys=['createdAt','code','name','quantity','unitSatang','totalSatang','notes','branch','groupName','category'] as (keyof Asset)[];return <TableHead key={label} className={isNum?'text-right':isCenter?'text-center':'text-left'}><button className={`inline-flex items-center gap-1 ${isNum?'justify-end w-full':isCenter?'justify-center w-full':'text-left'}`} onClick={()=>{setSort({key:sortKeys[i],dir:sort.key===sortKeys[i]?-sort.dir:1});}}><span>{label}</span><ArrowUpDown size={11} className="opacity-50 flex-shrink-0"/></button></TableHead>;})}<TableHead className="text-center w-[130px]">จัดการ</TableHead></TableRow></TableHeader><TableBody>{filtered.slice(page*40,(page+1)*40).map((a,i)=>{const cleanGroup=(a.groupName||'').replace(/^\d+\s*\|\s*/,'').trim()||'—';return <TableRow key={a.id}><TableCell className="text-center font-medium text-slate-500">{page*40+i+1}</TableCell><TableCell className="mono">{a.code}</TableCell><TableCell><button className="asset-name" onClick={()=>setSelected(a)}>{a.name}</button><div className="status-line"><Badge value={a.condition}/>{a.lifecycle!=='active'&&<Badge value={a.lifecycle}/>} {a.parentId&&<span className="badge">รายการแยก</span>}</div></TableCell><TableCell className="num">{a.quantity}</TableCell><TableCell className="num">{money(a.unitSatang)}</TableCell><TableCell className="num font-semibold">{money(a.totalSatang)}</TableCell><TableCell>{a.notes&&a.location&&a.notes!==a.location?`${a.notes} • ${a.location}`:(a.notes||a.location||'—')}</TableCell><TableCell>{a.branch}</TableCell><TableCell className="whitespace-normal break-words" title={a.groupName||''}>{cleanGroup}</TableCell><TableCell className="whitespace-normal break-words">{a.category}</TableCell><TableCell className="text-center whitespace-nowrap"><div className="flex items-center justify-center gap-1.5">{editable&&a.lifecycle==='active'&&<Button variant="outline" size="sm" className="h-7 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200" onClick={()=>open('edit',{asset:a})} title="แก้ไขข้อมูล/ประวัติ"><Pencil size={12} className="mr-1"/>แก้ไข</Button>}<Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900" onClick={()=>setSelected(a)} title="ดูรายละเอียดและประวัติ"><History size={12} className="mr-1"/>ประวัติ</Button></div></TableCell></TableRow>;})}</TableBody></Table><Pager page={page} total={filtered.length} onChange={setPage}/></>:<Empty title={active.length?'ไม่พบรายการที่ตรงกับตัวกรอง':'ยังไม่มีรายการที่ยืนยันเข้าทะเบียน'}><p>{active.length?'ลองเปลี่ยนคำค้นหาหรือตัวกรอง':'ตรวจสอบข้อมูลต้นฉบับ แล้วนำเข้ารายการที่เจ้าหน้าที่ยืนยันแล้ว'}</p>{editable&&!active.length&&<Button variant="outline" onClick={()=>switchView('imports')}>เปิดข้อมูลต้นฉบับ</Button>}</Empty>}</div>}
  {view==='imports'&&<ImportView data={data} open={open} revision={revision} reload={reload}/>}
 {view==='overview'&&<div className="two-col"><div className="panel"><div className="panel-head"><h2>มูลค่าตามสาขา</h2><Button variant="ghost" size="sm" onClick={()=>switchView('reports')}>ดูรายงาน<ChevronRight size={16}/></Button></div><div className="panel-body">{branchTotals.length?branchTotals.slice(0,7).map(([b,v])=><button key={b} className="bar-row block w-full text-left" onClick={()=>{setBranch(b);switchView('registry');}}><div className="bar-label"><span>{b}</span><b>฿ {money(v)}</b></div><div className="bar-track"><div className="bar-fill" style={{width:(v/Math.max(1,branchTotals[0][1])*100)+'%'}}/></div></button>):<Empty title="รายงานจะปรากฏเมื่อนำเข้าทะเบียน"/>}</div></div><div className="panel"><div className="panel-head"><h2>กิจกรรมล่าสุด</h2><History size={18}/></div><div className="panel-body">{data.events.slice(0,6).map((e:Any)=><Activity key={e.id} event={e}/>)}{!data.events.length&&<Empty title="ยังไม่มีประวัติการทำงาน"/>}</div></div></div>}
 {['requests','stocktakes','reports','users','audit'].includes(view)&&<Operations view={view} data={data} open={open} write={write} busy={busy} revision={revision} select={setSelected} exportRows={exportRows}/>}
 </main></SidebarInset><Editor data={data} selected={selected} setSelected={setSelected} modal={modal} setModal={setModal} open={open} write={write} busy={busy} error={formError} setError={setFormError}/><Toaster position="bottom-right" richColors closeButton/></SidebarProvider>;
}

