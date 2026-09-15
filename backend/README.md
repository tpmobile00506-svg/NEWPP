# Backend — Node.js, PostgreSQL และ Prisma

Backend รันบน Node.js ผ่าน route adapters ของ Next.js ใน `frontend/app/api/` ใช้ PostgreSQL เป็นฐานข้อมูล และ Prisma เป็น ORM

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `auth/sessions.ts` | ตรวจรหัสผ่าน hash จัดการ session cookie และตรวจผู้ใช้ |
| `config/` | Environment และการตั้งค่า server |
| `contracts/domain.ts` | ชนิดข้อมูลและกฎคำนวณร่วมกับ frontend |
| `db/client.ts` | PostgreSQL pool, Prisma Client และ BigInt/JSON |
| `prisma/schema.prisma` | โครงสร้างข้อมูลของระบบ |
| `prisma/migrations/` | ประวัติการเปลี่ยน schema |
| `prisma/seed.ts` | เตรียมบัญชี Admin จาก environment |
| `routes/` | API ฝั่ง server |
| `services/asset-service.ts` | อ่านทะเบียน ตรวจข้อมูล นำเข้า และประวัติ |
| `services/asset-mutations.ts` | บันทึก แบ่งล็อต คำขอ อนุมัติ ตรวจนับ และผู้ใช้ |
| `imports/workbook.ts` | อ่าน XLSX และเก็บค่าต้นฉบับไว้ตรวจทาน |
| `storage/files.ts` | เก็บ/อ่านไฟล์ผ่าน PostgreSQL `StoredFile` |
| `data/` | ต้นฉบับส่วนตัวในเครื่อง ไม่รวมใน Git สาธารณะ |
| `scripts/` | คำสั่งดูแลระบบและ seed ต้นฉบับ |
| `tests/` | ทดสอบกฎธุรกิจและ API |
| `docs/` | รายงานตรวจการเปลี่ยนแปลง |
| `archive/` | โค้ด D1/Sites และ build script เก่า ไม่ใช้รันปัจจุบัน |
| `generated/`, `.cache/` | ไฟล์ที่เครื่องมือสร้าง ไม่แก้ด้วยมือ |

เงินเก็บเป็น `BigInt` หน่วยสตางค์ PostgreSQL transaction บันทึกการเปลี่ยนแปลงที่ต้องสำเร็จพร้อมกัน การแบ่งล็อตเก็บ parent เป็น `lifecycle=split` และนับยอดจากรายการลูกที่ใช้งานอยู่ การตอบ API ต้องแปลง BigInt และตรวจช่วงจำนวนเต็มที่ JavaScript รองรับ

## API หลัก

| Method / URL | หน้าที่ |
| --- | --- |
| `POST /api/auth/login` | เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน |
| `POST /api/auth/logout` | ยกเลิก session |
| `GET /api/data` | อ่านทะเบียน/ต้นฉบับ/ประวัติ/ตรวจนับตามพารามิเตอร์ view และสิทธิ์ |
| `POST /api/data` แบบ JSON | action ของทะเบียน คำขอ อนุมัติ ตรวจนับ ผู้ใช้ และการตั้งค่า |
| `POST /api/data` แบบ multipart ฟิลด์ file | อ่าน XLSX และเก็บต้นฉบับ |
| `GET /api/source?source=...` | ดาวน์โหลดต้นฉบับหลังตรวจสิทธิ์ |
| `GET /api/health` | ตรวจความพร้อมโดยไม่เปิดเผย credentials |

## คำสั่ง

รันจาก root หลังตั้งค่า environment ตาม [README หลัก](../README.md):

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run source:seed
```

`db:generate` สร้าง Prisma Client ส่วน `db:deploy` ติดตั้ง migrations โดยไม่ใช้ `db push --accept-data-loss` การ seed บัญชีและต้นฉบับแยกจาก build เพื่อควบคุมฐานข้อมูลเป้าหมายได้ ตรวจ schema และทำ baseline ก่อนเชื่อมกับฐานข้อมูลจากระบบก่อนหน้า

ต้นฉบับจาก `backend/data/` เข้าสู่ PostgreSQL เมื่อเรียก `source:seed` การอัปโหลดใหม่เก็บใน `StoredFile` จึงไม่พึ่งดิสก์ชั่วคราวของ serverless functions ควรสำรอง PostgreSQL รวมทั้งไฟล์ในตารางนี้ด้วย

ผลทดสอบระบบ D1 เดิมไม่ใช่ผลทดสอบ session/PostgreSQL ปัจจุบัน อ่าน [รายงานตรวจการเปลี่ยนแปลง](docs/CHANGE_AUDIT.md) สำหรับขอบเขตและสถานะการตรวจ ห้ามรันชุดทดสอบที่เขียนข้อมูลกับฐานข้อมูลทะเบียนจริง
