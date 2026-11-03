// Spreadsheet apps execute cells starting with these as formulas (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: unknown) {
  let s = value == null ? '' : String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

/** Download as a file; the BOM makes Excel read it as UTF-8. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
