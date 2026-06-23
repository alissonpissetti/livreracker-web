const NATIONAL_DIGITS = 11;

function extractNationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > NATIONAL_DIGITS) {
    digits = digits.slice(2);
  }

  return digits.slice(0, NATIONAL_DIGITS);
}

function isMobileNumber(digits: string): boolean {
  return digits.length > 10 || digits[2] === '9';
}

export function formatBrazilPhoneInput(raw: string): string {
  const digits = extractNationalDigits(raw);

  if (!digits) {
    return '';
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (isMobileNumber(digits)) {
    if (rest.length <= 5) {
      return `(${ddd}) ${rest}`;
    }
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  }

  if (rest.length <= 4) {
    return `(${ddd}) ${rest}`;
  }

  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
}

export function isValidBrazilPhone(raw: string): boolean {
  const digits = extractNationalDigits(raw);

  if (digits.length === 10) {
    return true;
  }

  return digits.length === 11 && digits[2] === '9';
}

export function brazilPhoneToE164(raw: string): string {
  const digits = extractNationalDigits(raw);

  if (!isValidBrazilPhone(digits)) {
    throw new Error('Informe um telefone válido com DDD');
  }

  return `+55${digits}`;
}

export function phoneStoredToBrazilInput(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }
  return formatBrazilPhoneInput(phone);
}

export function maskBrazilPhone(phone: string | null | undefined): string {
  if (!phone) {
    return 'Não cadastrado';
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) {
    return '****';
  }
  return `****${digits.slice(-4)}`;
}
