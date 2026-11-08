import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatShortDate, parseShortDate, toDay } from '../date';
import { clickSort, parseCount, sortStocks } from '../lists';
import type { StockItem, StockSort, StockSortKey } from '../types';
import type { StockInput } from '../useStore';
import { CATEGORY_LIST_ID } from './CategoryList';
import { ExpiryInput } from './ExpiryInput';

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

function SortHeader(props: {
  sortKey: StockSortKey;
  label: string;
  sort: StockSort;
  onSortChange: (sort: StockSort) => void;
  className?: string;
}) {
  const { sortKey, sort } = props;
  const top = sort.order[0] === sortKey;
  const desc = sort.desc[sortKey];
  return (
    <th
      className={props.className}
      aria-sort={top ? (desc ? 'descending' : 'ascending') : undefined}
    >
      <button
        className={`sort-header${top ? ' sort-top' : ''}`}
        onClick={() => props.onSortChange(clickSort(sort, sortKey))}
      >
        {props.label}
        <span className="sort-mark" aria-hidden="true">
          {desc ? '▼' : '▲'}
          <sub>{sort.order.indexOf(sortKey) + 1}</sub>
        </span>
      </button>
    </th>
  );
}

export function StockTable(props: {
  stocks: StockItem[];
  today: number;
  disabled: boolean;
  sort: StockSort;
  onSortChange: (sort: StockSort) => void;
  onConsume: (id: string) => void;
  onUpdate: (id: string, input: StockInput) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ category: '', content: '', count: '', expiry: '' });

  if (props.stocks.length === 0) return <p className="empty">{t('emptyStocks')}</p>;

  const draftExpiry = parseShortDate(draft.expiry);
  const startEdit = (s: StockItem) => {
    setEditing(s.id);
    setDraft({
      category: s.category,
      content: s.content,
      count: String(s.count),
      expiry: formatShortDate(s.expiry),
    });
  };
  const save = () => {
    if (!editing || !draftExpiry) return;
    props.onUpdate(editing, {
      category: draft.category.trim(),
      content: draft.content.trim(),
      count: parseCount(draft.count),
      expiry: draftExpiry,
    });
    setEditing(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(null);
  };
  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  const header = (sortKey: StockSortKey, label: string, className?: string) => (
    <SortHeader
      sortKey={sortKey}
      label={label}
      sort={props.sort}
      onSortChange={props.onSortChange}
      className={className}
    />
  );

  const rows = sortStocks(props.stocks, props.sort);

  return (
    <div className="table-wrap">
      <table className="stock-table">
        <thead>
          <tr>
            {header('added', t('field.addedDate'))}
            {header('category', t('field.category'), 'col-category')}
            <th className="col-content">{t('field.content')}</th>
            <th className="num">{t('field.count')}</th>
            {header('expiry', t('field.expiry'))}
            <th>{t('field.consume')}</th>
            <th>{t('field.edit')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) =>
            editing === s.id ? (
              <tr key={s.id} className="editing">
                <td>{formatDate(s.addedDate)}</td>
                <td className="col-category">
                  <input
                    value={draft.category}
                    onChange={set('category')}
                    onKeyDown={onKey}
                    list={CATEGORY_LIST_ID}
                    aria-label={t('field.category')}
                    autoFocus
                  />
                </td>
                <td className="col-content">
                  <input
                    value={draft.content}
                    onChange={set('content')}
                    onKeyDown={onKey}
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
                  <ExpiryInput
                    value={draft.expiry}
                    onChange={(expiry) => setDraft((d) => ({ ...d, expiry }))}
                    onKeyDown={onKey}
                    ariaLabel={t('field.expiry')}
                  />
                </td>
                <td />
                <td className="actions">
                  <button onClick={save} disabled={props.disabled || !draftExpiry}>
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
                <td className="col-category">{s.category}</td>
                <td className="col-content">{s.content}</td>
                <td className="num">{s.count}</td>
                <td>
                  {formatShortDate(s.expiry)} <ExpiryBadge expiry={s.expiry} today={props.today} />
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
