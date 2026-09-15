'use client';
import {useState,useEffect,useRef} from 'react';
import {Upload,Search,FileSpreadsheet,Package,TriangleAlert,Check,Download,Filter,Sparkles,Zap,CheckSquare} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Skeleton} from '@/components/ui/skeleton';
import {toast} from 'sonner';
import {Candidate,money} from '@/shared/domain';
import {Any,api,Metric,Pick,Pager,Empty} from '@/frontend/components/common';

const sheetLabels: Record<string, string> = {
  'สำนักงาน': '🏢 สำนักงาน',
  'คอม': '💻 คอมพิวเตอร์',
  'ไฟฟ้า': '⚡ ไฟฟ้า',
  'โฆษณา': '📢 โฆษณาและเผยแพร่',
  'การศึกษา': '🎓 ครุภัณฑ์การศึกษา',
  'โรงงาน': '🏭 ช่างกลโรงงาน',
  'เกษตร': '🚜 เครื่องจักรกลเกษตร',
  'งานครัว': '🍽️ งานครัว / สุขาภิบาล',
  'วิทยาศาสตร์': '🔬 วิทยาศาสตร์',
  'สำรวจ': '📐 สำรวจ',
  'ยานพาหนะ': '🚗 ยานพาหนะ',
  'ชำรุด งปม 2568': '⚠️ ชำรุด งปม 2568',
  'ชำรุด งปม67': '⚠️ ชำรุด งปม 2567',
  'ชำรุดปี 66': '⚠️ ชำรุดปี 2566',
  'ไม่มีตัวตน': '💾 สินทรัพย์ไม่มีตัวตน',
  'รถจีวากอนเป็นวัสดุฝึกสอน': '📦 วัสดุฝึกสอน (จีวากอน)',
};

const branchOptions: [string, string][] = [
  ['all', 'ทุกสาขาวิชา'],
  ['วิศวกรรมคอมพิวเตอร์ (วค)', '💻 วศ.คอมพิวเตอร์ (วค)'],
  ['วิศวกรรมไฟฟ้า (วฟ)', '⚡ วศ.ไฟฟ้า (วฟ)'],
  ['วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)', '🏗️ วศ.โยธา/โลจิสติกส์ (วย/วล)'],
  ['วิศวกรรมอุตสาหการ (วอ)', '⚙️ วศ.อุตสาหการ (วอ)'],
  ['วิศวกรรมเครื่องกล (วคม)', '🔧 วศ.เครื่องกล (วคม)'],
  ['เทคโนโลยีเครื่องจักรกลเกษตร (คจก)', '🚜 เทคโนโลยีเครื่องจักรกลเกษตร (คจก)'],
  ['สำนักงานคณบดี (ควอ.)', '🏢 สำนักงานคณบดี (ควอ.)'],
  ['สาขาออกแบบ', '🎨 สาขาออกแบบ'],
  ['ส่วนกลาง / การศึกษา', '🏛️ ส่วนกลาง / การศึกษา'],
];

const kindOptions: [string, string][] = [
  ['pending', '📋 รายการรอนำเข้าทั้งหมด'],
  ['ready', '🟢 ข้อมูลสมบูรณ์ (พร้อมนำเข้า)'],
  ['issue-range', '🟠 รหัสช่วง (เช่น 0001 ถึง 0008)'],
  ['issue-name', '🟡 ชื่อว่างเปล่า (จาก Merge Cell)'],
  ['issue-price', '🔵 ราคาเป็น 0 / เป็นชุด'],
  ['issue-duplicate', '🔴 รหัสซ้ำ / ชีตชำรุด'],
  ['review', '⚠️ ต้องตรวจทานทั้งหมด'],
  ['annotations', '📑 หัวตารางและยอดยก'],
  ['all', '📁 ทุกแถวต้นทาง'],
];

export default function ImportView({data,open,revision,reload}:{data:Any;open:(k:string,a?:Any)=>void;revision:number;reload:()=>Promise<void>}){
  const [id,setId]=useState(data.imports?.[0]?.id || 'provided-2569'),
    [source,setSource]=useState<Any|null>(null),
    [sheet,setSheet]=useState('all'),
    [branch,setBranch]=useState('all'),
    [kind,setKind]=useState('pending'),
    [search,setSearch]=useState(''),
    [page,setPage]=useState(0),
    [loading,setLoading]=useState(false),
    [busy,setBusy]=useState(false),
    [error,setError]=useState(''),
    [selectedKeys,setSelectedKeys]=useState<Set<string>>(new Set());
  const ref=useRef<HTMLInputElement>(null);
  const editable=['staff','admin'].includes(data.me.role);

  useEffect(()=>{
    if((!id || id==='provided-2569') && data.imports?.[0]?.id) setId(data.imports[0].id);
  },[data.imports]);

  useEffect(()=>{
    setPage(0);
    setSelectedKeys(new Set());
  },[id,sheet,branch,kind,search]);

  useEffect(()=>{
    let cancelled=false;
    const timer=setTimeout(async()=>{
      setLoading(true);
      try{
        const params=new URLSearchParams({view:'source',source:id,sheet,branch,kind,q:search,page:String(page)});
        const r=await api('?'+params);
        if(!cancelled){setSource(r);setError('');}
      }catch(e:any){
        if(!cancelled)setError(e.message);
      }finally{
        if(!cancelled)setLoading(false);
      }
    },180);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[id,sheet,branch,kind,search,page,revision]);

  async function reloadSource() {
    const params=new URLSearchParams({view:'source',source:id,sheet,branch,kind,q:search,page:String(page)});
    const r=await api('?'+params);
    setSource(r);
  }

  const currentUnimportedRows = source?.rows?.filter((r: Any) => r.kind === 'asset' && !r.done) || [];
  const isAllPageSelected = currentUnimportedRows.length > 0 && currentUnimportedRows.every((r: Any) => selectedKeys.has(r.key));

  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllPageSelected) {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        currentUnimportedRows.forEach((r: Any) => next.delete(r.key));
        return next;
      });
    } else {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        currentUnimportedRows.forEach((r: Any) => next.add(r.key));
        return next;
      });
    }
  };

  async function handleImportSelected() {
    if (!selectedKeys.size) return;
    if (!confirm(`ยืนยันนำเข้ารายการที่เลือกจำนวน ${selectedKeys.size} รายการ เข้าสู่ทะเบียนกลางพร้อมกัน?`)) return;
    setBusy(true);
    try {
      const res = await api('', { action: 'batchImport', sourceId: id, keys: Array.from(selectedKeys) });
      toast.success(`นำเข้ารายการที่เลือกสำเร็จแล้ว ${res.count} รายการ!`);
      setSelectedKeys(new Set());
      await reload();
      await reloadSource();
    } catch (e: any) {
      toast.error(e.message || 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function handleImportAllReady() {
    if (!source?.stats?.ready) {
      toast.info('ไม่มีรายการที่พร้อมนำเข้า');
      return;
    }
    if (!confirm(`ยืนยันนำเข้า "ทุกรายการที่ข้อมูลสมบูรณ์" จำนวน ${source.stats.ready} รายการ เข้าสู่ทะเบียนกลางโดยอัตโนมัติ?`)) return;
    setBusy(true);
    try {
      const res = await api('', { action: 'batchImport', sourceId: id, allReady: true });
      toast.success(`นำเข้ารายการที่พร้อมสำเร็จแล้วทั้งหมด ${res.count} รายการ! 🎉`);
      setSelectedKeys(new Set());
      await reload();
      await reloadSource();
    } catch (e: any) {
      toast.error(e.message || 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickImport(row: Candidate) {
    setBusy(true);
    try {
      const res = await api('', { action: 'batchImport', sourceId: id, keys: [row.key] });
      toast.success(`นำเข้า ${row.asset?.name || row.asset?.code} สำเร็จแล้ว!`);
      await reload();
      await reloadSource();
    } catch (e: any) {
      toast.error(e.message || 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function upload(file:File){
    setBusy(true);
    try{
      if(file.size>10*1024*1024)throw Error('รองรับไฟล์ไม่เกิน 10 MB');
      const form=new FormData();form.set('file',file);
      const r=await api('',form);
      await reload();
      setId(r.id);setSheet('all');setBranch('all');
      toast.success(r.duplicate?'เปิดไฟล์เดิมที่มีอยู่แล้ว':'เก็บไฟล์ต้นฉบับแล้ว พร้อมตรวจสอบ');
    }catch(e:any){
      toast.error(e.message);
    }finally{
      setBusy(false);
      if(ref.current)ref.current.value='';
    }
  }

  const sheetOptions: [string, string][] = source
    ? [['all', 'ทุกชีต (' + source.sheets.length + ' ชีต)'], ...source.sheets.map((s: string) => [s, sheetLabels[s] || s] as [string, string])]
    : [['all', 'ทุกชีต']];

  return (
    <>
      <input className="hidden" ref={ref} type="file" accept=".xlsx" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0]);}}/>
      {error&&<div className="error">{error}</div>}
      <div className="panel">
        <div className="panel-head">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-blue-600"/>
            <div>
              <h2>ข้อมูลต้นฉบับ</h2>
              <p className="caption">ไฟล์เดิมเก็บครบ แยกการตรวจทานออกจากทะเบียน</p>
            </div>
          </div>
          <div className="actions flex items-center gap-2">
            {editable && source && source.stats?.ready > 0 && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all flex items-center gap-1.5"
                disabled={busy}
                onClick={handleImportAllReady}
                title="นำเข้าเฉพาะรายการที่ข้อมูลสมบูรณ์ครบ 100% ทั้งหมดในคลิกเดียว"
              >
                <Sparkles size={16}/> นำเข้าทุกรายการที่พร้อม ({source.stats.ready} รายการ)
              </Button>
            )}
            {editable&&<Button disabled={busy} variant="outline" onClick={()=>ref.current?.click()}><Upload size={16}/>{busy?'กำลังอ่านไฟล์…':'อัปโหลด Excel'}</Button>}
          </div>
        </div>

        <div className="toolbar">
          <Pick label="ไฟล์ต้นฉบับ" value={id} onChange={setId} options={data.imports.map((s:Any)=>[s.id,s.name])}/>
        </div>

        {source&&<>
          <div className="panel-body">
            <div className="metric-grid mb-0">
              <Metric label="แถวต้นทางทั้งหมด" value={source.stats.rows.toLocaleString('th-TH')} note={source.sheets.length+' ชีต'} icon={FileSpreadsheet}/>
              <Metric label="แถวที่อาจเป็นครุภัณฑ์" value={source.stats.assets.toLocaleString('th-TH')} note="ยังไม่ใช่จำนวนรายการที่รับรอง" icon={Package}/>
              <Metric label="ต้องตรวจทานเพิ่มเติม" value={source.stats.review.toLocaleString('th-TH')} note="รหัสช่วง ชุด ราคา หรือชีตประวัติ" icon={TriangleAlert}/>
              <Metric label="นำเข้าแล้ว" value={source.stats.imported.toLocaleString('th-TH')} note="เชื่อมโยงกลับแถวต้นฉบับได้" icon={Check}/>
            </div>
            <div className="notice">
              คอลัมน์ G เดิมเสนอไว้ทั้ง “หมายเหตุ” และ “สถานที่” เพื่อให้ตรวจทาน • ข้อความชุดและโครงการอยู่ใน “หมวด” • หัวกระดาษและยอดยกเก็บในต้นฉบับโดยไม่รวมยอดทะเบียน
            </div>
            <div className="actions">
              <Button variant="outline" size="sm" asChild>
                <a href={'/api/source?source='+encodeURIComponent(id)} download><Download size={15}/>ดาวน์โหลดไฟล์เดิม</a>
              </Button>
              <span className="caption overflow-wrap">SHA-256: {source.hash.slice(0,20)}…</span>
            </div>
          </div>

          <div className="toolbar flex flex-wrap gap-2 items-center">
            <div className="searchbox flex-1 min-w-[200px]">
              <Search/>
              <Input aria-label="ค้นหาข้อมูลต้นฉบับ" placeholder="ค้นหาข้อความ รหัส หรือโครงการ…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <Pick label="ชีต" value={sheet} onChange={setSheet} options={sheetOptions}/>
            <Pick label="สาขาวิชา" value={branch} onChange={setBranch} options={branchOptions}/>
            <Pick label="สถานะ/ปัญหา" value={kind} onChange={setKind} options={kindOptions}/>
          </div>

          {/* Quick Issue Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-6 py-2.5 bg-slate-50 border-t border-b border-slate-200 text-xs">
            <span className="font-semibold text-slate-600 mr-1 flex items-center gap-1"><Filter size={13}/> คัดแยกด่วน:</span>
            <button type="button" onClick={()=>setKind('pending')} className={`badge cursor-pointer transition-all ${kind==='pending'?'ring-2 ring-blue-500 font-bold bg-blue-50 text-blue-700':''}`}>
              📋 รอนำเข้า ({source.stats.assets - source.stats.imported})
            </button>
            <button type="button" onClick={()=>setKind('ready')} className={`badge normal cursor-pointer transition-all ${kind==='ready'?'ring-2 ring-emerald-500 font-bold bg-emerald-50 text-emerald-700':''}`}>
              🟢 พร้อมเข้า ({source.stats.ready ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-range')} className={`badge repair cursor-pointer transition-all ${kind==='issue-range'?'ring-2 ring-amber-500 font-bold bg-amber-50 text-amber-700':''}`}>
              🟠 รหัสช่วง ({source.stats.rangeIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-name')} className={`badge repair cursor-pointer transition-all ${kind==='issue-name'?'ring-2 ring-yellow-500 font-bold bg-yellow-50 text-yellow-800':''}`}>
              🟡 ชื่อว่าง ({source.stats.nameIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-price')} className={`badge split cursor-pointer transition-all ${kind==='issue-price'?'ring-2 ring-indigo-500 font-bold bg-indigo-50 text-indigo-700':''}`}>
              🔵 ราคา 0/ชุด ({source.stats.priceIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-duplicate')} className={`badge damaged cursor-pointer transition-all ${kind==='issue-duplicate'?'ring-2 ring-rose-500 font-bold bg-rose-50 text-rose-700':''}`}>
              🔴 รหัสซ้ำ/ชำรุด ({source.stats.dupIssues ?? 0})
            </button>
          </div>

          {loading ? (
            <div className="p-6"><Skeleton className="h-32"/></div>
          ) : (
            <>
              <Table className="source-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] text-center">
                      <Checkbox
                        checked={isAllPageSelected}
                        disabled={!currentUnimportedRows.length}
                        onCheckedChange={toggleSelectAll}
                        title="เลือก/ยกเลิก ทั้งหมดในหน้านี้"
                      />
                    </TableHead>
                    <TableHead className="w-[140px]">ชีต / สาขา / แถว</TableHead>
                    <TableHead>ข้อมูลจาก Excel</TableHead>
                    <TableHead className="text-center w-[85px]">จำนวน</TableHead>
                    <TableHead className="text-right w-[135px]">ยอดเดิม (บาท)</TableHead>
                    <TableHead className="w-[190px]">การตรวจทาน</TableHead>
                    <TableHead className="w-[130px] text-right"/>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {source.rows.map((r:Candidate&{done:boolean})=>(
                    <TableRow key={r.key} className={selectedKeys.has(r.key)?'bg-emerald-50/50 dark:bg-emerald-950/20':''}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedKeys.has(r.key)}
                          disabled={r.done || r.kind !== 'asset'}
                          onCheckedChange={()=>toggleSelect(r.key)}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-slate-800">{r.sheet}</div>
                        {r.kind==='asset' && r.asset.branch && (
                          <div className="text-[11px] text-blue-700 font-medium truncate max-w-[130px]" title={r.asset.branch}>
                            {r.asset.branch}
                          </div>
                        )}
                        <p className="caption">แถว {r.row}</p>
                        {r.asset.location && (
                          <p className="text-[11px] text-slate-500 truncate max-w-[130px]" title={r.asset.location}>
                            📍 {r.asset.location}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="source-name">
                        <b>{r.asset.name||r.values.filter(Boolean).map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' • ')}</b>
                        <p className="source-note mono">{r.kind==='asset'&&r.asset.code}</p>
                      </TableCell>

                      <TableCell className="text-center">
                        {r.kind==='asset'?r.asset.quantity:'—'}
                      </TableCell>

                      <TableCell className="num">
                        {r.kind==='asset'?money(r.asset.totalSatang||0):'ดูต้นฉบับ'}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={`badge ${r.done?'approved':r.kind==='asset'?(r.issueType==='ready'||!r.issue?'normal':r.issueType==='range'?'repair':r.issueType==='name'?'repair':r.issueType==='price'?'split':r.issueType==='duplicate'?'damaged':'pending'):''}`}>
                            {r.done ? 'นำเข้าแล้ว' : r.kind === 'asset' ? (
                              r.issueType === 'ready' || !r.issue ? '🟢 พร้อมนำเข้า' :
                              r.issueType === 'range' ? '🟠 รหัสช่วง' :
                              r.issueType === 'name' ? '🟡 ชื่อว่าง' :
                              r.issueType === 'price' ? '🔵 ราคา 0 / ชุด' :
                              r.issueType === 'duplicate' ? '🔴 รหัสซ้ำ / ชำรุด' : '⚠️ ต้องตรวจทาน'
                            ) : ({header:'หัวกระดาษ',subtotal:'ยอดยก / ยอดรวม',group:'หัวข้อชุด / โครงการ',note:'ข้อความประกอบ'} as Any)[r.kind]}
                          </span>
                        </div>
                        <p className="source-note">{r.issue}</p>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.kind==='asset'&&!r.done&&editable ? (
                            <>
                              {(!r.issue || r.issueType === 'ready') && (
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2 shadow-xs"
                                  disabled={busy}
                                  onClick={()=>handleQuickImport(r)}
                                  title="นำเข้ารายการนี้ทันทีไม่ต้องเปิดฟอร์ม"
                                >
                                  <Zap size={12}/> เข้าทันที
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={()=>open('import',{row:r,asset:r.asset,sourceId:id})}
                              >
                                {(!r.issue || r.issueType === 'ready') ? 'ตรวจละเอียด' : 'ตรวจสอบ'}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-xs h-7 text-slate-500" onClick={()=>open('source',{row:r})}>
                              ดูต้นฉบับ
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!source.rows.length&&<Empty title="ไม่มีแถวในตัวกรองนี้"/>}

              {/* Floating Batch Action Bar */}
              {selectedKeys.size > 0 && (
                <div className="sticky bottom-4 z-20 mx-4 my-3 p-3 bg-slate-900/95 backdrop-blur text-white rounded-xl shadow-2xl flex items-center justify-between gap-4 border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2 font-medium text-sm pl-2">
                    <CheckSquare className="text-emerald-400" size={18}/>
                    <span>เลือกอยู่ <b className="text-emerald-400 text-base">{selectedKeys.size}</b> รายการ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
                      onClick={()=>setSelectedKeys(new Set())}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md flex items-center gap-1"
                      disabled={busy}
                      onClick={handleImportSelected}
                    >
                      <Zap size={14}/> นำเข้า {selectedKeys.size} รายการพร้อมกัน
                    </Button>
                  </div>
                </div>
              )}

              <Pager page={page} total={source.total} onChange={setPage}/>
            </>
          )}
        </>}
        {!source&&<div className="p-6"><Skeleton className="h-52"/></div>}
      </div>
    </>
  );
}

