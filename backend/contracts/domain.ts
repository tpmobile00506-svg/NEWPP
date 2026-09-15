export const roles = {staff:'เจ้าหน้าที่',head:'หัวหน้าสำนักงาน',deputy:'รองฝ่ายบริการ',dean:'คณบดี',admin:'Admin'} as const;
export type Role = keyof typeof roles;
export const conditions = {normal:'ปกติ',damaged:'ชำรุด',repair:'กำลังซ่อม',missing:'ไม่พบ'} as const;
export const requestTypes = {transfer:'โอนย้าย',repair:'ซ่อมบำรุง',disposal:'จำหน่าย / ตัดบัญชี'} as const;
export const headers11 = ['ลำดับ','หมายเลขครุภัณฑ์','รายการ','จำนวน','ราคาต่อหน่วย','จำนวนเงิน','หมายเหตุ','สถานที่','สาขา','หมวด (กลุ่มต่างๆ)','สำนักงาน'];
export type Asset = {id:string;code:string;name:string;quantity:number;unitSatang:number;totalSatang:number;notes:string;location:string;branch:string;groupName:string;category:string;condition:string;lifecycle:string;version:number;parentId:string|null;sourceId:string|null;sourceRow:string|null;receivedDate:string;lifeYears:number;salvageSatang:number;serial:string;brand:string;custodian:string;createdAt:string};
export type Candidate = {key:string;sheet:string;row:number;kind:string;issue:string;issueType?:string;groupName:string;values:unknown[];asset:Partial<Asset>};
export type Source = {id:string;name:string;hash:string;sheets:{name:string;rows:{row:number;values:unknown[]}[]}[]};
export function satang(value: unknown): number {
  const text = String(value ?? '').replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error('กรุณากรอกจำนวนเงินไม่ติดลบ และทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole,part='']=text.split('.'); const n=Number(BigInt(whole)*100n+BigInt(part.padEnd(2,'0')));
  if(!Number.isSafeInteger(n)||n>100000000000000) throw Error('จำนวนเงินเกินขอบเขตที่รองรับ'); return n;
}
export function splitAmounts(quantity:number,total:number,take:number) {
  if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(take)||take<=0||take>=quantity||!Number.isSafeInteger(total)||total<0) throw Error('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1');
  const first=Number(BigInt(total)*BigInt(take)/BigInt(quantity)); return [first,total-first];
}
export function expandRange(code:string,quantity:number): string[]|null {
  if(quantity!==2)return null;
  const m=code.replace(/\s+/g,'').match(/^(.*-)(\d+)\((\d+)\)ถึง-?(\d+)\(\3\)$/);
  if(!m||Number(m[4])!==Number(m[2])+1)return null;
  return [m[1]+m[2]+'('+m[3]+')',m[1]+m[4]+'('+m[3]+')'];
}
export function bookValue(a:Pick<Asset,'receivedDate'|'lifeYears'|'salvageSatang'|'totalSatang'>,at=new Date()):number|null {
  if(!a.receivedDate||!a.lifeYears)return null;
  const start=new Date(a.receivedDate+'T00:00:00Z');if(!Number.isFinite(start.getTime()))return null;
  const days=Math.max(0,Math.floor((at.getTime()-start.getTime())/86400000));
  return Math.max(a.salvageSatang,a.totalSatang-Math.floor((a.totalSatang-a.salvageSatang)*Math.min(days/(a.lifeYears*365.25),1)));
}
export const money=(n:number)=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
function cell(v:unknown):unknown {if(v&&typeof v==='object'&&'cached' in v)return (v as {cached:unknown}).cached;return v;}
function str(v:unknown){return String(cell(v)??'').trim();}
export function normalizeBranch(raw: string, note: string, sheet: string): string {
  const s = (raw + ' ' + note).trim();
  if (/วฟ|ไฟฟ้า/.test(s)) return 'วิศวกรรมไฟฟ้า (วฟ)';
  if (/วค|คอม/.test(s)) return 'วิศวกรรมคอมพิวเตอร์ (วค)';
  if (/วคม|เครื่องกล/.test(s)) return 'วิศวกรรมเครื่องกล (วคม)';
  if (/วอ|อุตสาหการ|การผลิต|ช่างกล/.test(s)) return 'วิศวกรรมอุตสาหการ (วอ)';
  if (/วย|วล|โลจิสติก|โยธา/.test(s)) return 'วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)';
  if (/คจก|เกษตร/.test(s)) return 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)';
  if (/สนง|สนอ|ควอ|สโมสร|คณบดี/.test(s)) return 'สำนักงานคณบดี (ควอ.)';
  if (/ออกแบบ|ออบแบบ/.test(s)) return 'สาขาออกแบบ';
  if (sheet === 'คอม') return 'วิศวกรรมคอมพิวเตอร์ (วค)';
  if (sheet === 'ไฟฟ้า') return 'วิศวกรรมไฟฟ้า (วฟ)';
  if (sheet === 'เกษตร') return 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)';
  if (sheet === 'โรงงาน') return 'วิศวกรรมอุตสาหการ (วอ)';
  if (sheet === 'สำนักงาน') return 'สำนักงานคณบดี (ควอ.)';
  if (sheet === 'สำรวจ' || sheet === 'ยานพาหนะ') return 'สำนักงานคณบดี (ควอ.)';
  return 'ส่วนกลาง / การศึกษา';
}
export function classify(source:Source):Candidate[]{
 const out:Candidate[]=[];
 const codeCounts = new Map<string, number>();
 const codeHistorical = new Set<string>();
 for(const sh of source.sheets){
  const isHist = /ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sh.name);
  for(const r of sh.rows){
   const c = str(r.values[1]);
   if(c && /\d{2,}/.test(c)){
    codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
    if(isHist) codeHistorical.add(c);
   }
  }
 }
 for(const sheet of source.sheets){
  let group='';const historical=/ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sheet.name);let standard=false;
  for(const r of sheet.rows){
   const v=r.values;const text=v.map(str).filter(Boolean).join(' | ');const name=str(v[2]);const code=str(v[1]);
   let kind='note',issue='',issueType='other';
   if(text.includes('หมายเลขครุภัณฑ์')&&text.includes('ราคาต่อหน่วย')){kind='header';standard=v.length>=11&&str(v[7])==='สถานที่';}
   else if(/ยอดยกไป|ยอดยกมา|รวมทั้งสิ้น|รวมเป็นเงิน/.test(text))kind='subtotal';
   else if(/หน้าที่|รายละเอียดครุภัณฑ์คงเหลือ|^มหาวิทยาลัย|^ณ\s*วันที่|^คณะวิศวกรรม/.test(text))kind='header';
   else if(name && code && Number(cell(v[3]))>0){kind='asset';}
   else if(name&&code){kind='asset';issue='จำนวนหรือราคาของรายการย่อยยังไม่ครบ ต้องระบุวิธีลงมูลค่าชุด';issueType='price';}
   else if(!name&&/\d{2,}[-/]/.test(code)){kind='asset';issue='ชื่อหรือข้อมูลรายการที่รวมเซลล์ยังไม่ครบ ต้องตรวจสอบต้นฉบับ';issueType='name';}
   else if(!name&&code){kind='group';group=text;}
   else if(/ชุด|โครงการ|สัญญา|งบประมาณ|ประกอบด้วย|ทดแทน/.test(text)){kind='group';group=text;}
   let qty=Number(cell(v[3])),unit=0,total=0;
   const groupName=standard?str(v[9]):[group,...v.slice(8).map(str)].filter(Boolean).join(' • ');
   if(kind==='asset'){
    try{unit=satang(cell(v[4]));total=satang(cell(v[5]));}catch{issue ||= 'ข้อมูลราคาไม่ครบหรือไม่มีค่าผลลัพธ์สูตร';issueType='price';}
    if(!Number.isSafeInteger(qty)||qty<=0){qty=0;issue ||= 'ตรวจสอบจำนวนรายการ';}
    if(qty&&unit*qty!==total){issue ||= 'จำนวน × ราคาต่อหน่วยไม่ตรงยอดเดิม';if(issueType==='other')issueType='price';}
    if(codeHistorical.has(code)&&!historical){issue ||= 'รหัสนี้มีอยู่ในชีตชำรุด/ประวัติ อาจแทงจำหน่ายแล้ว';issueType='duplicate';}
    else if((codeCounts.get(code)||0)>1){issue ||= 'รหัสครุภัณฑ์ซ้ำซ้อนในไฟล์';issueType='duplicate';}
    else if(historical){issue ||= 'ชีตประวัติ / ชำรุด ต้องตรวจสอบรายการซ้ำกับทะเบียนหลัก';issueType='duplicate';}
    if(/ถึง/.test(code)||/\(\d+-\d+\)/.test(code)){issue ||= 'ช่วงรหัสไม่ชัดเจน ต้องตรวจสอบหมายเลขรายชิ้น';issueType='range';}
    if(group && (!unit || !total || unit*qty !== total)){issue ||= 'รายการอยู่ในชุด / โครงการ ต้องยืนยันการจัดกลุ่มและการลงมูลค่า';if(issueType==='other')issueType='price';}
    if(!unit&&!total&&!issue){issue='ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';issueType='price';}
    if(!issue)issueType='ready';
   }
   const rawBranch = standard ? str(v[8]) : (str(v[7]) || str(v[8]));
   const branch = normalizeBranch(rawBranch, str(v[6]), sheet.name);
   out.push({key:sheet.name+':'+r.row,sheet:sheet.name,row:r.row,kind,issue,issueType,groupName,values:v,asset:{code,name,quantity:qty||0,unitSatang:unit,totalSatang:total,notes:str(v[6]),location:standard?str(v[7]):str(v[6]),branch,groupName,category:standard?str(v[10]):'ครุภัณฑ์'+sheet.name,condition:'normal'}});
  }
 }return out;
}

