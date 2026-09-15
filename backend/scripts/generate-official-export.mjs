import { Pool } from 'pg';
import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';

const pool = new Pool({ connectionString: 'postgresql://postgres:252025@localhost:5432/ksu_asset_manager' });

async function generateExport() {
  const res = await pool.query('SELECT * FROM assets WHERE lifecycle != \'split\' ORDER BY id ASC');
  const assets = res.rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    quantity: r.quantity,
    unitSatang: r.unitSatang != null ? Number(r.unitSatang) : 0,
    totalSatang: r.totalSatang != null ? Number(r.totalSatang) : 0,
    notes: r.notes,
    location: r.location,
    branch: r.branch,
    groupName: r.groupName,
    category: r.category,
    lifecycle: r.lifecycle
  }));

  console.log(`Fetched ${assets.length} assets from database.`);

  const reportHeaders = [
    'ลำดับ',
    'หมายเลขครุภัณฑ์',
    'รายการ',
    'จำนวน',
    'ราคาต่อหน่วย',
    'จำนวนเงิน',
    'หมายเหตุ',
    'สาขา',
    'หมวด (กลุ่มต่างๆ)',
    'สำนักงาน'
  ];

  const w = new ExcelJS.Workbook();
  w.creator = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์';

  const s = w.addWorksheet('รายละเอียดครุภัณฑ์คงเหลือ', {
    views: [
      {
        workbookViewId: 0,
        rightToLeft: false,
        state: 'normal',
        showGridLines: true,
        style: 'pageBreakPreview'
      }
    ],
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2
      }
    }
  });
  delete s.pageSetup.scale;

  s.columns = [
    { width: 6.80 },   // 1: ลำดับ
    { width: 35.00 },  // 2: หมายเลขครุภัณฑ์
    { width: 45.00 },  // 3: รายการ
    { width: 6.50 },   // 4: จำนวน
    { width: 12.50 },  // 5: ราคาต่อหน่วย
    { width: 14.50 },  // 6: จำนวนเงิน
    { width: 26.00 },  // 7: หมายเหตุ (รวมสถานที่)
    { width: 17.50 },  // 8: สาขา
    { width: 17.00 },  // 9: หมวด (กลุ่มต่างๆ)
    { width: 17.00 }   // 10: สำนักงาน
  ];

  const todayThai = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  const ITEMS_PER_PAGE = 48;
  const totalPages = Math.max(1, Math.ceil(assets.length / ITEMS_PER_PAGE));

  let currentItemIndex = 0;
  let lastCarriedForwardRow = null;

  for (let page = 1; page <= totalPages; page++) {
    const pageAssets = assets.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const isFirstPage = page === 1;
    const isLastPage = page === totalPages;

    // แถว 1: มหาวิทยาลัยกาฬสินธุ์ (ผสาน A:I กึ่งกลาง)
    const r1 = s.addRow(['มหาวิทยาลัยกาฬสินธุ์']);
    const r1Idx = r1.number;
    s.mergeCells(`A${r1Idx}:I${r1Idx}`);
    r1.height = 24.95;
    r1.getCell(1).font = { name: 'TH Sarabun New', size: 14, bold: true };
    r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 2: รายละเอียดครุภัณฑ์คงเหลือ (ผสาน A:I กึ่งกลางตรงแนวกันเป๊ะ) และ เลขหน้า (คอลัมน์ J กึ่งกลางช่อง ใส่แค่ตัวเลข 1, 2, 3)
    const r2 = s.addRow([
      'รายละเอียดครุภัณฑ์คงเหลือ', '', '', '', '', '', '', '', '',
      page
    ]);
    const r2Idx = r2.number;
    s.mergeCells(`A${r2Idx}:I${r2Idx}`);
    r2.height = 24.95;
    r2.getCell(1).font = { name: 'TH Sarabun New', size: 14, bold: true };
    r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    r2.getCell(10).font = { name: 'TH Sarabun New', size: 14, bold: true };
    r2.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 3: ณ วันที่ (ผสาน A:I กึ่งกลางตรงแนวกับแถว 1 และ 2 พร้อมเส้นขีดล่างเต็ม 10 คอลัมน์)
    const r3 = s.addRow([`ณ  วันที่  ${todayThai}`]);
    const r3Idx = r3.number;
    s.mergeCells(`A${r3Idx}:I${r3Idx}`);
    r3.height = 24.95;
    r3.getCell(1).font = { name: 'TH Sarabun New', size: 14, bold: true };
    r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 1; c <= 10; c++) {
      r3.getCell(c).border = { bottom: { style: 'thin' } };
    }

    // แถว 4: หัวตาราง 10 คอลัมน์
    const r4 = s.addRow(reportHeaders);
    r4.height = 31.5;
    for (let col = 1; col <= 10; col++) {
      const c = r4.getCell(col);
      c.font = { name: 'TH Sarabun New', size: 12, bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    let pageStartDataRow = null;
    let pageEndDataRow = null;
    let broughtForwardRowIdx = null;

    if (isFirstPage) {
      // แถว 5: หมวดคณะ (เฉพาะหน้าแรก ผสาน A:C)
      const r5 = s.addRow(['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม']);
      const r5Idx = r5.number;
      s.mergeCells(`A${r5Idx}:C${r5Idx}`);
      r5.height = 23.1;
      for (let col = 1; col <= 10; col++) {
        const c = r5.getCell(col);
        c.font = { name: 'TH Sarabun New', size: 12, bold: true, color: { argb: 'FF0000FF' } };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      r5.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    } else {
      // แถว ยอดยกมา (หน้าที่ 2 เป็นต้นไป)
      const rBrought = s.addRow([
        'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม',
        '',
        '',
        '',
        'ยอดยกมา',
        { formula: `F${lastCarriedForwardRow}` },
        '',
        '',
        '',
        ''
      ]);
      broughtForwardRowIdx = rBrought.number;
      s.mergeCells(`A${broughtForwardRowIdx}:C${broughtForwardRowIdx}`);
      rBrought.height = 23.1;
      for (let col = 1; col <= 10; col++) {
        const c = rBrought.getCell(col);
        c.font = { name: 'TH Sarabun New', size: 12, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      rBrought.getCell(1).font = { name: 'TH Sarabun New', size: 12, bold: true, color: { argb: 'FF0000FF' } };
      rBrought.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      rBrought.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      rBrought.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      rBrought.getCell(6).numFmt = '#,##0.00';
    }

    // แถวข้อมูลในหน้านี้ (ตัวหนังสือ 12pt เท่ากันทุกช่อง + shrinkToFit เพื่อป้องกัน ####### เด็ดขาด)
    pageAssets.forEach((a) => {
      currentItemIndex++;
      const notesCombined = a.notes && a.location && a.notes !== a.location
        ? `${a.notes} • ${a.location}`
        : (a.notes || a.location || '—');

      const cleanGroup = (a.groupName || '').replace(/^\d+\s*\|\s*/, '').trim() || '—';

      const rowValues = [
        currentItemIndex,
        a.code,
        a.name,
        a.quantity,
        a.unitSatang / 100,
        null,
        notesCombined,
        a.branch,
        cleanGroup,
        a.category
      ];

      const dr = s.addRow(rowValues);
      const drIdx = dr.number;
      if (!pageStartDataRow) pageStartDataRow = drIdx;
      pageEndDataRow = drIdx;

      dr.getCell(6).value = { formula: `D${drIdx}*E${drIdx}`, result: a.totalSatang / 100 };
      dr.height = 23.1;

      for (let col = 1; col <= 10; col++) {
        const c = dr.getCell(col);
        const isNum = [5, 6].includes(col);
        const isCenter = [1, 4].includes(col);
        c.font = {
          name: 'TH Sarabun New',
          size: 12,
          bold: false
        };
        c.alignment = {
          vertical: 'middle',
          horizontal: isCenter ? 'center' : isNum ? 'right' : 'left',
          wrapText: false,
          shrinkToFit: isNum
        };
        c.border = {
          top: { style: 'hair' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      dr.getCell(4).numFmt = '#,##0';
      dr.getCell(5).numFmt = '#,##0.00';
      dr.getCell(6).numFmt = '#,##0.00';
    });

    if (!isLastPage && pageStartDataRow && pageEndDataRow) {
      // แถว ยอดยกไป (ท้ายหน้านี้)
      const carriedFormula = isFirstPage
        ? `SUM(F${pageStartDataRow}:F${pageEndDataRow})`
        : `SUM(F${broughtForwardRowIdx}, F${pageStartDataRow}:F${pageEndDataRow})`;

      const rCarried = s.addRow(['', '', '', '', 'ยอดยกไป', { formula: carriedFormula }, '', '', '', '']);
      const rCarriedIdx = rCarried.number;
      lastCarriedForwardRow = rCarriedIdx;
      rCarried.height = 23.1;

      for (let col = 1; col <= 10; col++) {
        const c = rCarried.getCell(col);
        c.font = { name: 'TH Sarabun New', size: 12, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      rCarried.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      rCarried.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      rCarried.getCell(6).numFmt = '#,##0.00';

      // บังคับขึ้นหน้าใหม่ทันทีใต้แถวยอดยกไป เพื่อไม่ให้หัวข้อหน้าถัดไปหลุดมารองก้นเด็ดขาด
      rCarried.addPageBreak();
    } else if (isLastPage && pageStartDataRow && pageEndDataRow) {
      // แถว รวมทั้งสิ้น (ท้ายหน้าสุดท้าย)
      const sumFormula = (totalPages === 1)
        ? `SUM(F${pageStartDataRow}:F${pageEndDataRow})`
        : `SUM(F${broughtForwardRowIdx}, F${pageStartDataRow}:F${pageEndDataRow})`;

      const totalRow = s.addRow([
        'รวม',
        '',
        '',
        '',
        '',
        { formula: sumFormula },
        '',
        '',
        '',
        ''
      ]);
      const totalRowIdx = totalRow.number;
      s.mergeCells(`B${totalRowIdx}:E${totalRowIdx}`);
      s.mergeCells(`G${totalRowIdx}:J${totalRowIdx}`);
      totalRow.height = 24.95;

      totalRow.getCell(2).value = { formula: `"("&BAHTTEXT(F${totalRowIdx})&")"` };

      for (let col = 1; col <= 10; col++) {
        const c = totalRow.getCell(col);
        c.font = { name: 'TH Sarabun New', size: 12, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'double' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', shrinkToFit: true };
      totalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      totalRow.getCell(6).numFmt = '#,##0.00';
    }
  }

  const fileName = 'รายละเอียดครุภัณฑ์คงเหลือ-10-คอลัมน์.xlsx';
  const localDest = path.join(process.cwd(), '..', fileName);
  const downloadDest = path.join(os.homedir(), 'Downloads', fileName);

  await w.xlsx.writeFile(localDest);
  console.log('Saved to workspace root:', localDest);

  try {
    await w.xlsx.writeFile(downloadDest);
    console.log('Saved to user Downloads folder:', downloadDest);
  } catch (err) {
    console.warn('Could not write to Downloads:', err.message);
  }

  pool.end();
}

generateExport().catch(e => {
  console.error(e);
  pool.end();
});
