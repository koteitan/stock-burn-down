import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parseShortDate } from '../date';

/** Text input for a best-before date written as YY/MM/DD; `value` is the raw text. */
export function ExpiryInput(props: {
  value: string;
  onChange: (text: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const invalid = props.value.trim() !== '' && parseShortDate(props.value) === null;

  useEffect(() => {
    ref.current?.setCustomValidity(invalid ? t('invalidDate') : '');
  }, [invalid, t]);

  return (
    <input
      ref={ref}
      className="date-text"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
      placeholder="YY/MM/DD"
      required
      size={9}
      autoComplete="off"
      aria-invalid={invalid}
      aria-label={props.ariaLabel}
      autoFocus={props.autoFocus}
    />
  );
}
