import path from 'path';
import { createRequire } from 'module';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { TaskRateWithTask, PaymentSummary } from '@/types/payment';

// createRequire yields a native Node require at runtime. We pair it with a
// dynamically constructed specifier (string concatenation) so webpack's static
// analyzer cannot detect a literal path and thus will NOT pull the .ttf files
// into the bundle as asset modules. The .ttf files are instead copied into the
// standalone output via outputFileTracingIncludes in next.config.ts.
// __filename is available because this file compiles to CJS in the Node bundle.
const nodeRequire = createRequire(__filename);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake');

let fontsInitialized = false;

function ensureFonts(): void {
  if (fontsInitialized) return;

  // Build the specifier dynamically so webpack cannot resolve it at build time.
  // At runtime, Node's require.resolve still walks node_modules correctly — this
  // works regardless of process.cwd() (important for Next.js standalone where
  // cwd=/app but pdfmake lives under /app/.next/standalone/node_modules).
  const pkg = 'pdfmake';
  const fontSubpath = '/build/fonts/Roboto/Roboto-Regular.ttf';
  const robotoRegular = nodeRequire.resolve(pkg + fontSubpath);
  const fontDir = path.dirname(robotoRegular);

  pdfmake.addFonts({
    Roboto: {
      normal: path.join(fontDir, 'Roboto-Regular.ttf'),
      bold: path.join(fontDir, 'Roboto-Medium.ttf'),
      italics: path.join(fontDir, 'Roboto-Italic.ttf'),
      bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf'),
    },
  });
  fontsInitialized = true;
}

// ==================== Helpers ====================

const STATUS_MAP: Record<string, string> = {
  COMPLETED: 'Завершена',
  IN_PROGRESS: 'В работе',
  PENDING: 'Ожидает',
  DEFERRED: 'Отложена',
  NEW: 'Новая',
  DECLINED: 'Отклонена',
};

function translateTaskStatus(status: string): string {
  return STATUS_MAP[status] || status;
}

function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateTotal(rate: TaskRateWithTask): number {
  if (rate.rateType === 'hourly') {
    const hours = rate.hoursOverride ?? (rate.timeSpent ? rate.timeSpent / 3600 : 0);
    return rate.amount * hours;
  }
  return rate.amount;
}

function formatHours(rate: TaskRateWithTask): string {
  if (rate.rateType === 'fixed') return '—';
  const hours = rate.hoursOverride ?? (rate.timeSpent ? rate.timeSpent / 3600 : 0);
  return hours.toFixed(2);
}

// ==================== PDF Generation ====================

export type ReportDesign = 'official' | 'modern';

export interface GeneratePaymentReportParams {
  user: { firstName: string; lastName: string; email: string };
  rates: TaskRateWithTask[];
  summary: PaymentSummary;
  filters: {
    portalName?: string;
    dateFrom?: string;
    dateTo?: string;
    isPaid?: boolean;
    taskStatus?: string;
  };
  generatedAt: string;
  design?: ReportDesign;
}

// ==================== Shared helpers ====================

function buildFilterLines(filters: GeneratePaymentReportParams['filters']): string[] {
  const lines: string[] = [];
  if (filters.dateFrom || filters.dateTo) {
    lines.push(`Период: ${filters.dateFrom || '...'} — ${filters.dateTo || '...'}`);
  }
  if (filters.portalName) lines.push(`Портал: ${filters.portalName}`);
  if (filters.isPaid !== undefined) lines.push(`Статус оплаты: ${filters.isPaid ? 'Оплачено' : 'Не оплачено'}`);
  if (filters.taskStatus) lines.push(`Статус задачи: ${translateTaskStatus(filters.taskStatus)}`);
  return lines;
}

// ==================== Official Design ====================

function buildOfficialDoc(params: GeneratePaymentReportParams): TDocumentDefinitions {
  const { user, rates, summary, filters, generatedAt } = params;
  const fullName = `${user.lastName} ${user.firstName}`;
  const filterLines = buildFilterLines(filters);
  const grandTotal = rates.reduce((sum, r) => sum + calculateTotal(r), 0);

  const content: Content[] = [
    { text: 'Отчёт о выполненных работах', style: 'header', alignment: 'center' },
    {
      margin: [0, 10, 0, 5] as [number, number, number, number],
      columns: [
        { text: `ФИО: ${fullName}`, width: '*' },
        { text: `Email: ${user.email}`, width: '*' },
        { text: `Дата: ${generatedAt}`, width: 'auto', alignment: 'right' as const },
      ],
    },
  ];

  if (filterLines.length > 0) {
    content.push({
      margin: [0, 5, 0, 5] as [number, number, number, number],
      stack: [
        { text: 'Применённые фильтры:', bold: true, fontSize: 10, margin: [0, 0, 0, 3] as [number, number, number, number] },
        ...filterLines.map((line) => ({ text: line, fontSize: 9, color: '#555555' })),
      ],
    });
  }

  content.push({
    columns: [
      { width: '*', stack: [{ text: 'Всего', style: 'summaryLabel' }, { text: `${formatMoney(summary.totalEarned)} руб.`, style: 'summaryValue' }, { text: `${summary.taskCount} задач`, style: 'summarySubtext' }], alignment: 'center' as const },
      { width: '*', stack: [{ text: 'Оплачено', style: 'summaryLabel' }, { text: `${formatMoney(summary.totalPaid)} руб.`, style: 'summaryValueGreen' }], alignment: 'center' as const },
      { width: '*', stack: [{ text: 'Не оплачено', style: 'summaryLabel' }, { text: `${formatMoney(summary.totalUnpaid)} руб.`, style: 'summaryValueRed' }], alignment: 'center' as const },
    ],
    columnGap: 10,
    margin: [0, 10, 0, 15] as [number, number, number, number],
  });

  const tableHeader: TableCell[] = [
    { text: '№', style: 'tableHeader' }, { text: 'Задача', style: 'tableHeader' }, { text: 'Портал', style: 'tableHeader' },
    { text: 'Тип ставки', style: 'tableHeader' }, { text: 'Ставка (руб.)', style: 'tableHeader' }, { text: 'Часы', style: 'tableHeader' },
    { text: 'Итого (руб.)', style: 'tableHeader' }, { text: 'Статус задачи', style: 'tableHeader' }, { text: 'Оплата', style: 'tableHeader' },
  ];

  const tableRows: TableCell[][] = rates.map((rate, i) => {
    const total = calculateTotal(rate);
    return [
      { text: String(i + 1), alignment: 'center' as const }, { text: rate.taskTitle, noWrap: false }, { text: rate.portalName },
      { text: rate.rateType === 'hourly' ? 'Почасовая' : 'Фиксированная' }, { text: formatMoney(rate.amount), alignment: 'right' as const },
      { text: formatHours(rate), alignment: 'center' as const }, { text: formatMoney(total), alignment: 'right' as const },
      { text: translateTaskStatus(rate.taskStatus) }, { text: rate.isPaid ? 'Оплачено' : 'Не оплачено' },
    ];
  });

  const totalRow: TableCell[] = [
    { text: '', colSpan: 6 }, {}, {}, {}, {}, {},
    { text: formatMoney(grandTotal), style: 'tableHeader', alignment: 'right' as const },
    { text: 'ИТОГО', style: 'tableHeader', colSpan: 2 }, {},
  ];

  content.push({
    table: { headerRows: 1, widths: [25, '*', 'auto', 'auto', 60, 40, 65, 'auto', 'auto'], body: [tableHeader, ...tableRows, totalRow] },
    layout: {
      hLineWidth: (i: number, node: { table: { body: TableCell[][] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? '#333333' : '#cccccc'),
      vLineColor: () => '#cccccc',
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
    },
    fontSize: 8,
  });

  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [30, 40, 30, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 0, 0, 5] },
      tableHeader: { bold: true, fontSize: 8, fillColor: '#f0f0f0' },
      summaryLabel: { fontSize: 10, bold: true, color: '#333333' },
      summaryValue: { fontSize: 14, bold: true, margin: [0, 3, 0, 0] },
      summaryValueGreen: { fontSize: 14, bold: true, color: '#2e7d32', margin: [0, 3, 0, 0] },
      summaryValueRed: { fontSize: 14, bold: true, color: '#c62828', margin: [0, 3, 0, 0] },
      summarySubtext: { fontSize: 8, color: '#888888', margin: [0, 2, 0, 0] },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Страница ${currentPage} из ${pageCount}`, alignment: 'center' as const, fontSize: 8, color: '#888888', margin: [0, 10, 0, 0] as [number, number, number, number],
    }),
    content,
  };
}

// ==================== Modern Design ====================

const ACCENT = '#6366f1'; // indigo-500
const ACCENT_LIGHT = '#eef2ff'; // indigo-50
const ACCENT_DARK = '#4338ca'; // indigo-700
const GREEN = '#059669'; // emerald-600
const GREEN_BG = '#ecfdf5'; // emerald-50
const RED = '#dc2626'; // red-600
const RED_BG = '#fef2f2'; // red-50
const GRAY = '#6b7280'; // gray-500
const GRAY_LIGHT = '#f9fafb'; // gray-50
const DARK = '#111827'; // gray-900

function buildModernDoc(params: GeneratePaymentReportParams): TDocumentDefinitions {
  const { user, rates, summary, filters, generatedAt } = params;
  const fullName = `${user.lastName} ${user.firstName}`;
  const filterLines = buildFilterLines(filters);
  const grandTotal = rates.reduce((sum, r) => sum + calculateTotal(r), 0);
  const paidCount = rates.filter(r => r.isPaid).length;
  const unpaidCount = rates.length - paidCount;

  const content: Content[] = [];

  // Header band with accent color
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'Отчёт о выполненных работах', fontSize: 22, bold: true, color: '#ffffff', margin: [0, 0, 0, 4] as [number, number, number, number] },
          { text: `${fullName}  ·  ${user.email}`, fontSize: 10, color: '#c7d2fe', margin: [0, 0, 0, 2] as [number, number, number, number] },
          { text: `Сформирован: ${generatedAt}`, fontSize: 9, color: '#a5b4fc' },
        ],
        fillColor: ACCENT,
        margin: [16, 14, 16, 14] as [number, number, number, number],
      }]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 16] as [number, number, number, number],
  });

  // Filters line (compact)
  if (filterLines.length > 0) {
    content.push({
      text: filterLines.join('  |  '),
      fontSize: 8, color: GRAY, italics: true,
      margin: [0, 0, 0, 12] as [number, number, number, number],
    });
  }

  // Summary cards — 3 colored rounded boxes
  content.push({
    columns: [
      {
        width: '*',
        table: { widths: ['*'], body: [[{
          stack: [
            { text: 'ВСЕГО ЗАРАБОТАНО', fontSize: 7, bold: true, color: ACCENT_DARK, characterSpacing: 0.5 },
            { text: `${formatMoney(summary.totalEarned)} ₽`, fontSize: 20, bold: true, color: DARK, margin: [0, 4, 0, 2] as [number, number, number, number] },
            { text: `${summary.taskCount} задач`, fontSize: 8, color: GRAY },
          ],
          fillColor: ACCENT_LIGHT,
          margin: [12, 10, 12, 10] as [number, number, number, number],
        }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      { width: 10, text: '' },
      {
        width: '*',
        table: { widths: ['*'], body: [[{
          stack: [
            { text: 'ОПЛАЧЕНО', fontSize: 7, bold: true, color: GREEN, characterSpacing: 0.5 },
            { text: `${formatMoney(summary.totalPaid)} ₽`, fontSize: 20, bold: true, color: GREEN, margin: [0, 4, 0, 2] as [number, number, number, number] },
            { text: `${paidCount} задач`, fontSize: 8, color: GRAY },
          ],
          fillColor: GREEN_BG,
          margin: [12, 10, 12, 10] as [number, number, number, number],
        }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      { width: 10, text: '' },
      {
        width: '*',
        table: { widths: ['*'], body: [[{
          stack: [
            { text: 'НЕ ОПЛАЧЕНО', fontSize: 7, bold: true, color: RED, characterSpacing: 0.5 },
            { text: `${formatMoney(summary.totalUnpaid)} ₽`, fontSize: 20, bold: true, color: RED, margin: [0, 4, 0, 2] as [number, number, number, number] },
            { text: `${unpaidCount} задач`, fontSize: 8, color: GRAY },
          ],
          fillColor: RED_BG,
          margin: [12, 10, 12, 10] as [number, number, number, number],
        }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
    ],
    margin: [0, 0, 0, 16] as [number, number, number, number],
  });

  // Section label
  content.push({
    text: 'ДЕТАЛИЗАЦИЯ',
    fontSize: 8, bold: true, color: ACCENT, characterSpacing: 1,
    margin: [0, 0, 0, 6] as [number, number, number, number],
  });

  // Modern table — accent header, zebra stripes
  const headerStyle = { fontSize: 8, bold: true, color: '#ffffff', fillColor: ACCENT, margin: [4, 6, 4, 6] as [number, number, number, number] };
  const tableHeader: TableCell[] = [
    { text: '№', ...headerStyle, alignment: 'center' as const },
    { text: 'Задача', ...headerStyle },
    { text: 'Портал', ...headerStyle },
    { text: 'Тип', ...headerStyle },
    { text: 'Ставка', ...headerStyle, alignment: 'right' as const },
    { text: 'Часы', ...headerStyle, alignment: 'center' as const },
    { text: 'Итого', ...headerStyle, alignment: 'right' as const },
    { text: 'Статус', ...headerStyle },
    { text: 'Оплата', ...headerStyle, alignment: 'center' as const },
  ];

  const tableRows: TableCell[][] = rates.map((rate, i) => {
    const total = calculateTotal(rate);
    const bg = i % 2 === 0 ? '#ffffff' : GRAY_LIGHT;
    const paidBg = rate.isPaid ? GREEN_BG : RED_BG;
    const paidColor = rate.isPaid ? GREEN : RED;
    const paidText = rate.isPaid ? 'Оплачено' : 'Не оплачено';

    return [
      { text: String(i + 1), alignment: 'center' as const, fillColor: bg, fontSize: 8 },
      { text: rate.taskTitle, noWrap: false, fillColor: bg, fontSize: 8 },
      { text: rate.portalName, fillColor: bg, fontSize: 8 },
      { text: rate.rateType === 'hourly' ? 'Час' : 'Фикс', fillColor: bg, fontSize: 8 },
      { text: `${formatMoney(rate.amount)} ₽`, alignment: 'right' as const, fillColor: bg, fontSize: 8 },
      { text: formatHours(rate), alignment: 'center' as const, fillColor: bg, fontSize: 8 },
      { text: `${formatMoney(total)} ₽`, alignment: 'right' as const, fillColor: bg, fontSize: 8, bold: true },
      { text: translateTaskStatus(rate.taskStatus), fillColor: bg, fontSize: 8 },
      { text: paidText, alignment: 'center' as const, fillColor: paidBg, color: paidColor, fontSize: 7, bold: true },
    ];
  });

  // Total row — dark accent
  const totalStyle = { fontSize: 9, bold: true, color: '#ffffff', fillColor: ACCENT_DARK, margin: [4, 6, 4, 6] as [number, number, number, number] };
  const totalRow: TableCell[] = [
    { text: '', colSpan: 6, ...totalStyle }, {}, {}, {}, {}, {},
    { text: `${formatMoney(grandTotal)} ₽`, ...totalStyle, alignment: 'right' as const },
    { text: 'ИТОГО', ...totalStyle, colSpan: 2, alignment: 'center' as const }, {},
  ];

  content.push({
    table: {
      headerRows: 1,
      widths: [22, '*', 'auto', 32, 60, 35, 65, 'auto', 62],
      body: [tableHeader, ...tableRows, totalRow],
    },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => '#e5e7eb',
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4,
    },
  });

  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [24, 24, 24, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: DARK },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'TaskHub — Payment Report', fontSize: 7, color: '#d1d5db', margin: [24, 0, 0, 0] as [number, number, number, number] },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: '#d1d5db', alignment: 'right' as const, margin: [0, 0, 24, 0] as [number, number, number, number] },
      ],
    }),
    content,
  };
}

// ==================== Public API ====================

/**
 * Generate a PDF payment report buffer.
 * @param params.design 'official' (default) — classic formal layout; 'modern' — colorful, card-based design
 */
export async function generatePaymentReport(
  params: GeneratePaymentReportParams
): Promise<Buffer> {
  try {
    ensureFonts();
  } catch (err) {
    console.error('[pdf-generator] Failed to initialize pdfmake fonts', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      cwd: process.cwd(),
    });
    throw err;
  }

  const design = params.design ?? 'official';
  const docDefinition = design === 'modern' ? buildModernDoc(params) : buildOfficialDoc(params);

  try {
    const pdf = pdfmake.createPdf(docDefinition);
    const buffer = await pdf.getBuffer();
    return Buffer.from(buffer);
  } catch (err) {
    console.error('[pdf-generator] pdf.getBuffer() failed', {
      design,
      rateCount: params.rates.length,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}
