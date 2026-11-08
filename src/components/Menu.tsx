import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang, Settings, StorageMode, Theme } from '../types';

const REPO_URL = 'https://github.com/koteitan/stock-burn-down';

function Radios<T extends string>(props: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="radios">
      <legend>{props.legend}:</legend>
      {props.options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={props.name}
            value={o.value}
            checked={props.value === o.value}
            onChange={() => props.onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function Menu(props: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { settings, onChange } = props;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        className="menu-button"
        aria-label={t('menu')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div className="menu-panel">
          <Radios<Theme>
            name="theme"
            legend={t('settings.theme')}
            value={settings.theme}
            options={[
              { value: 'dark', label: t('settings.dark') },
              { value: 'light', label: t('settings.light') },
              { value: 'system', label: t('settings.system') },
            ]}
            onChange={(theme) => onChange({ theme })}
          />
          <Radios<Lang>
            name="lang"
            legend={t('settings.lang')}
            value={settings.lang}
            options={[
              { value: 'ja', label: t('settings.ja') },
              { value: 'en', label: t('settings.en') },
            ]}
            onChange={(lang) => onChange({ lang })}
          />
          <Radios<StorageMode>
            name="storage"
            legend={t('settings.storage')}
            value={settings.storage}
            options={[
              { value: 'browser', label: t('settings.browser') },
              { value: 'nostr', label: t('settings.nostr') },
            ]}
            onChange={(storage) => onChange({ storage })}
          />
          <ul className="menu-links">
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                {t('settings.github')}
              </a>
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                {t('settings.license')}
              </a>
            </li>
          </ul>
          <div className="version">v{__APP_VERSION__}</div>
        </div>
      )}
    </div>
  );
}
