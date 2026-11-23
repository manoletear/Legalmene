import ExcelJS from "exceljs";

export interface ColumnaXlsx<T> {
  titulo: string;
  valor: (fila: T) => string | number | Date | null | undefined;
  ancho?: number;
}

export interface HojaXlsx<T = unknown> {
  nombre: string;
  columnas: ColumnaXlsx<T>[];
  filas: T[];
}

// Nombres de hoja: máx. 31 caracteres y sin []:*?/\ (restricción de Excel).
function nombreHoja(nombre: string): string {
  return nombre.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

// Acepta hojas de distintos tipos de fila en un mismo libro.
export type HojaGenerica = { nombre: string; columnas: ColumnaXlsx<never>[]; filas: readonly unknown[] };

export async function libroXlsx(hojas: HojaGenerica[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LegalChile PSL";
  wb.created = new Date();
  for (const h of hojas) {
    const ws = wb.addWorksheet(nombreHoja(h.nombre));
    ws.columns = h.columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? Math.max(12, c.titulo.length + 2) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const f of h.filas) ws.addRow(h.columnas.map((c) => c.valor(f as never) ?? ""));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
