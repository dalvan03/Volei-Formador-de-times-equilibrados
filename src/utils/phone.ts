/** Display-only mask: authentication continues to use the unformatted digits. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const number = digits.slice(2);
  const split = number.length > 8 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${number.slice(0, split)}${number.length > split ? '-' + number.slice(split) : ''}`;
}

/** Brazilian mobile number: two-digit area code followed by nine digits. */
export const isValidMobilePhone = (value: string): boolean => /^[1-9]\d9\d{8}$/.test(value.replace(/\D/g, ''));
