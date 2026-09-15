# Frontend — Next.js และ React

โฟลเดอร์นี้เป็น Next.js project root ใช้ package manager จาก root ของ repository รัน `npm run dev` ที่ root แล้วเปิด `http://localhost:3000`

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `app/page.tsx`, `app/layout.tsx` | จุดเริ่มหน้าเว็บและ layout |
| `app/login/` | หน้าเข้าสู่ระบบ |
| `app/api/` | ตัวเชื่อม Next.js ไปยัง API ฝั่ง backend |
| `features/inventory/` | ทะเบียน ตัวกรอง ฟอร์ม รายละเอียด QR และแบ่งล็อต |
| `features/imports/` | ตรวจทาน Excel ก่อนนำเข้าทะเบียน |
| `features/operations/` | คำขอ อนุมัติ ตรวจนับ รายงาน และบัญชีผู้ใช้ |
| `components/common.tsx` | ส่วนประกอบร่วมและ HTTP client |
| `components/ui/` | ส่วนประกอบหน้าจอ shadcn |
| `hooks/` | React hooks และเครื่องมือ WebMCP ทางเลือก |
| `services/excel-export.ts` | สร้าง Excel และพิมพ์จากข้อมูลที่ผู้ใช้เข้าถึงได้ |
| `styles/` | CSS สำหรับหน้าจอ งานพิมพ์ และ styles ภายนอกพร้อมใบอนุญาต |
| `public/` | favicon และไฟล์ที่เปิดผ่านเว็บได้โดยตรง |
| `utils/` | ตัวช่วย UI |
| `next.config.ts`, `postcss.config.mjs`, `tsconfig.json` | ตั้งค่า Next.js, Tailwind/PostCSS และ TypeScript |

Frontend เรียก API บน origin เดียวกัน Route adapters อยู่ใน `app/api/` ตามรูปแบบ Next.js แต่การอ่าน Excel การตรวจสิทธิ์ การคำนวณธุรกรรม และการเชื่อม PostgreSQL อยู่ใน [backend](../backend/README.md)

ชนิดข้อมูลและกฎคำนวณที่ใช้ร่วมกันอยู่ที่ `backend/contracts/domain.ts` ไฟล์นี้ต้องไม่มีการเชื่อมฐานข้อมูลหรือการอ่าน secrets ห้ามนำโมดูล server เช่น `backend/db/client.ts` ไป import ใน client component

ห้ามเก็บ Excel ต้นฉบับ ข้อมูลส่วนบุคคล `.env` หรือรหัสผ่านใน `public/` และห้ามใส่ข้อมูลลับในตัวแปร `NEXT_PUBLIC_*`

อ่านวิธีติดตั้งและเผยแพร่ที่ [README หลัก](../README.md) และ [รายงานตรวจการเปลี่ยนแปลง](../backend/docs/CHANGE_AUDIT.md)
