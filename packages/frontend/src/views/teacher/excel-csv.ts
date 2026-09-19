/**
 * Format a solved/total fraction for CSV cells opened in Excel.
 * Bare values like `1/2` are auto-parsed as dates (e.g. 1月2日).
 * Returning `="1/2"` forces Excel to treat the cell as text while still
 * displaying `1/2`.
 */
export function excelSafeFraction(solved: number, total: number) {
  const left = Number.isFinite(Number(solved)) ? Number(solved) : 0;
  const right = Number.isFinite(Number(total)) ? Number(total) : 0;
  return `="${left}/${right}"`;
}
