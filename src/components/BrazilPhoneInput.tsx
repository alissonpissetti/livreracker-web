import type { InputHTMLAttributes } from 'react';
import { formatBrazilPhoneInput } from '../utils/phone';

type BrazilPhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: string;
  onChange: (value: string) => void;
};

export function BrazilPhoneInput({
  value,
  onChange,
  placeholder = '(11) 98765-4321',
  inputMode = 'tel',
  autoComplete = 'tel-national',
  ...props
}: BrazilPhoneInputProps) {
  return (
    <input
      {...props}
      type="tel"
      inputMode={inputMode}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(formatBrazilPhoneInput(event.target.value))}
    />
  );
}
