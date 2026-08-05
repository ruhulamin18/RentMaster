export const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export const bnToEnNums = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return val
    .toString()
    .replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));
};

export const normalizeStr = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const converted = bnToEnNums(val);
  return converted.toString().toLowerCase().replace(/[\s\-_,.]/g, '');
};

export const normalizePhone = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const converted = bnToEnNums(val);
  return converted.toString().replace(/\D/g, '');
};

export const isPhoneSearch = (value: string) => {
  return normalizePhone(value).length >= 8;
};

export const isExactFlatNoSearch = (value: string) => {
  const normalized = normalizeStr(value);
  return normalized.length > 0 && /^[a-z0-9]+$/i.test(normalized);
};
