'use client';
import {ReactNode} from 'react';import {ClipboardList,History} from 'lucide-react';import {Button} from '@/components/ui/button';import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';import {Pagination,PaginationContent,PaginationItem} from '@/components/ui/pagination';import {conditions} from '@/shared/domain';
export type Any=Record<string,any>;
export const date=(s:string)=>new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
export const statusLabel=(s:string)=>({...conditions,active:'ใช้งาน',split:'แบ่งรายการแล้ว',disposed:'จำหน่ายแล้ว',pending:'รออนุมัติ',approved:'อนุมัติแล้ว',rejected:'ส่งกลับ',mismatch:'ข้อมูลไม่ตรง',open:'เปิดตรวจนับ',closed:'ปิดรอบแล้ว'} as Any)[s]||s;
export function Badge({value}:{value:string}){return <span className={'badge '+value}>{statusLabel(value)}</span>}
export function Pick({value,onChange,options,label,name}:{value?:string;onChange?:(v:string)=>void;options:[string,string][];label:string;name?:string}){return <Select value={value} onValueChange={onChange} name={name} defaultValue={value?undefined:options[0]?.[0]}><SelectTrigger className="filter" aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty-state"><ClipboardList size={40}/><h3>{title}</h3>{children}</div>}
export function Metric({label,value,note,icon:Icon}:{label:string;value:string|number;note:string;icon:any}){return <div className="metric"><div className="label">{label}<Icon/></div><div className="value">{value}</div><small>{note}</small></div>}
export function Pager({page,total,size=40,onChange}:{page:number;total:number;size?:number;onChange:(n:number)=>void}){const totalPages=Math.ceil(total/size);return <div className="table-footer"><span>{total?((page*size+1)+'–'+Math.min((page+1)*size,total)):'0'} จาก {total.toLocaleString('th-TH')} รายการ</span>{totalPages>1&&<Pagination><PaginationContent><PaginationItem><Button variant="outline" size="sm" disabled={page===0} onClick={()=>onChange(page-1)}>ก่อนหน้า</Button></PaginationItem><PaginationItem><span className="px-3 text-sm text-slate-600">{page+1} / {totalPages}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" disabled={(page+1)*size>=total} onClick={()=>onChange(page+1)}>ถัดไป</Button></PaginationItem></PaginationContent></Pagination>}</div>}
export const SESSION_EXPIRED_EVENT = 'asset-session-expired';
export async function readApiResponse(response: Response): Promise<Any> {
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  let data: unknown;
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Expected JSON');
    data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected an object');
  } catch {
    const error = new Error(response.ok ? 'เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง กรุณาลองใหม่' : 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่') as Error & { status: number };
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  if (!response.ok) {
    const message = (data as Any).error;
    const e = new Error(typeof message === 'string' ? message : 'ไม่สามารถเชื่อมต่อได้') as Error & { status: number };
    e.status = response.status;
    throw e;
  }
  return data as Any;
}
export async function api(params = '', body?: Any | FormData) {
  const response = await fetch('/api/data' + params, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body instanceof FormData ? undefined : body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const data = await readApiResponse(response);
  const view = new URLSearchParams(params).get('view') || 'state';
  const valid = body ? data.ok === true : view === 'state'
    ? typeof data.me?.name === 'string' && typeof data.me?.role === 'string' && ['assets', 'requests', 'rounds', 'users', 'invites', 'events', 'imports', 'approvals'].every(key => Array.isArray(data[key])) && !!data.settings
    : view === 'history' ? Array.isArray(data.events) && Array.isArray(data.children)
    : view === 'stocktake' ? Array.isArray(data.items)
    : view === 'source' ? Array.isArray(data.rows) && Array.isArray(data.sheets) && !!data.stats
    : false;
  if (!valid) throw new Error('เซิร์ฟเวอร์ส่งข้อมูลไม่ครบ กรุณาลองใหม่');
  return data;
}
export function Activity({event:e}:{event:Any}){return <div className="activity"><div className="activity-icon"><History size={17}/></div><div><b>{e.action}</b><p>{e.actorName}{e.reason?' · '+e.reason:''}</p><small>{date(e.createdAt)}</small></div></div>}
