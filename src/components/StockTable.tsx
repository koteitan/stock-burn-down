import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, toDay } from '../date';
import { compareStock, parseCount } from '../lists';
import type { StockItem } from '../types';
import type { StockInput } from '../useStore';
import { CATEGORY_LIST_ID } from './CategoryList';

const SOON_DAYS = 30;

interface Draft {
  category: string;
  content: string;
  count: string;
  expiry: string;
}

function ExpiryBadge({ expiry, today }: { expiry: string; today: number }) {
  const { t } = useTranslation();
  const left = toDay(expiry) - today;
  if (left < 0) return <span className="badge critical">{t('expired')}</span>;
  if (left <= SOON_DAYS) return <span className="badge warning">{t('expiringSoon')}</span>;
  return null;
}

export function StockTable(props: {
  stocks: StockItem[];
  today: number;
  disabled: boolean;
  onConsume: (id: string) => void;
  onUpdate: (id: string, input: StockInput) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ category: '', content: '', count: '', expiry: '' });

  if (props.stocks.length === 0) return <p className="empty">{t('emptyStocks')}</p>;

  const startEdit = (s: StockItem) => {
    setEditing(s.id);
    setDraft({
      category: s.category,
      content: s.content,
      count: String(s.count),
      expiry: s.expiry,
    });
  };
  const save = () => {
    if (!editing || !draft.expiry) return;
    props.onUpdate(editing, {
      category: draft.category.trim(),
      content: draft.content.trim(),
      count: parseCount(draft.count),
      expiry: draft.expiry,
    });
    setEditing(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(null);
  };
  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const rows = [...props.stocks].sort(compareStock);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('field.addedDate')}</th>
            <th>{t('field.category')}</th>
            <th>{t('field.content')}</th>
            <th className="num">{t('field.count')}</th>
            <th>{t('field.expiry')}</th>
            <th>{t('field.consume')}</th>
            <th>{t('field.edit')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) =>
            editing === s.id ? (
              <tr key={s.id} className="editing">
                <td>{formatDate(s.addedDate)}</td>
                <td>
                  <input
                    value={draft.category}
                    onChange={set('category')}
                    onKeyDown={onKey}
                    list={CATEGORY_LIST_ID}
                    size={8}
                    aria-label={t('field.category')}
                    autoFocus
                  />
                </td>
                <td>
                  <input
                    value={draft.content}
                    onChange={set('content')}
                    onKeyDown={onKey}
                    size={12}
                    aria-label={t('field.content')}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.count}
                    onChange={set('count')}
                    onKeyDown={onKey}
                    className="num"
                    aria-label={t('field.count')}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    required
                    value={draft.expiry}
                    onChange={set('expiry')}
                    onKeyDown={onKey}
                    aria-label={t('field.expiry')}
                  />
                </td>
                <td />
                <td className="actions">
                  <button onClick={save} disabled={props.disabled || !draft.expiry}>
                    {t('action.done')}
                  </button>
                  <button onClick={() => setEditing(null)}>{t('action.cancel')}</button>
                  <button
                    className="danger"
                    onClick={() => props.onDelete(s.id)}
                    disabled={props.disabled}
                  >
                    {t('action.delete')}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td>{formatDate(s.addedDate)}</td>
                <td>{s.category}</td>
                <td>{s.content}</td>
                <td className="num">{s.count}</td>
                <td>
                  {formatDate(s.expiry)} <ExpiryBadge expiry={s.expiry} today={props.today} />
                </td>
                <td>
                  <button onClick={() => props.onConsume(s.id)} disabled={props.disabled}>
                    {t('action.consume')}
                  </button>
                </td>
                <td>
                  <button onClick={() => startEdit(s)} disabled={props.disabled}>
                    {t('action.edit')}
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
