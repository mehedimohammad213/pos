/** Bangladesh mobile: 01XXXXXXXXX or +8801XXXXXXXXX */
export function normalizeBdPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('01') && digits.length === 11) {
    return digits;
  }
  throw new Error('Invalid BD phone number. Use 01XXXXXXXXX');
}

export function isValidBdPhone(input: string): boolean {
  try {
    normalizeBdPhone(input);
    return true;
  } catch {
    return false;
  }
}
