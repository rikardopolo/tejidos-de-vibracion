/**
 * utils.ts · Utilidades compartidas del proyecto Tejidos de Vibración.
 */

const ROMAN_MAP: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'],  [90, 'XC'],  [50, 'L'],  [40, 'XL'],
  [10, 'X'],   [9, 'IX'],   [5, 'V'],   [4, 'IV'],
  [1, 'I'],
];

/**
 * Convierte un número entero positivo a numeral romano.
 * romanize(1)  → "I"
 * romanize(3)  → "III"
 * romanize(10) → "X"
 */
export function romanize(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  let result = '';
  let remaining = n;
  for (const [value, numeral] of ROMAN_MAP) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}
