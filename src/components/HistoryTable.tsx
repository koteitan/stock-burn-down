import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDateTime,
  formatShortDate,
  fromDateTimeInput,
  parseShortDate,
  toDateTimeInput,
  toDay,
} from '../date';
import { dayOfTime } from '../chart';
import { compareRecord, parseCount } from '../lists';
import type { ConsumeRecord } from '../types';
import type { RecordInput } from '../useStore';
import { CATEGORY_LIST_ID } from './CategoryList';
import { ExpiryInput } from './ExpiryInput';

interface Draft {
  at: string;
  category: string;
  content: string;
  count: string;
  expiry: string;
}

export function HistoryTable(props: {
  history: ConsumeRecord[];
  /** Category order of the groups (the chart order). */
  categoryOrder: string[];
  chartStart: string;
  onDeleteBefore: (category: string) => void;
  disabled: boolean;
  onUpdate: (id: string, input: RecordInput) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    at: '',
    category: '',
    content: '',
    count: '',
    expiry: '',
  });

  if (props.history.length === 0) return <p className="empty">{t('emptyHistory')}</p>;

  const at = fromDateTimeInput(draft.at);
  const expiry = parseShortDate(draft.expiry);
  const valid = at !== null && expiry !== null;
  const save = () => {
    if (!editing || at === null || !expiry) return;
    props.onUpdate(editing, {
      at,
      category: draft.category.trim(),
      content: draft.content.trim(),
      count: parseCount(draft.count),
      expiry,
    });
    setEditing(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(null);
  };
  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const start = toDay(props.chartStart);
  const groups = props.categoryOrder
    .map((category) => {
      const rows = props.history
        .filter((h) => h.category === category)
        .sort((a, b) => compareRecord(b, a));
      return { category, rows, old: rows.filter((h) => dayOfTime(h.at) < start).length };
    })
    .filter((g) => g.rows.length > 0);
  const deleteBefore = (category: string, n: number) => {
    const message = t('deleteBeforeStartConfirm', {
      category: category || t('noCategory'),
      date: formatShortDate(props.chartStart),
      n,
    });
    if (window.confirm(message)) props.onDeleteBefore(category);
  };

  return (
    <div className="table-wrap history-table">
      <table>
        <thead>
          <tr>
            <th>{t('field.consumedAt')}</th>
            <th>{t('field.category')}</th>
            <th>{t('field.content')}</th>
            <th className="num">{t('field.consumedCount')}</th>
            <th>{t('field.expiry')}</th>
            <th>{t('field.edit')}</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={`g:${g.category}`}>
            <tr className="group-row">
              <th colSpan={5} scope="rowgroup">
                {g.category || t('noCategory')}
                <span className="group-note">{t('oldRecords', { n: g.old })}</span>
              </th>
              <td>
                <button
                  className="danger"
                  disabled={props.disabled || g.old === 0}
                  onClick={() => deleteBefore(g.category, g.old)}
                >
                  {t('action.deleteBeforeStart')}
                </button>
              </td>
            </tr>
            {g.rows.map((h) =>
              editing === h.id ? (
                <tr key={h.id} className="editing">
                  <td>
                    <input
                      type="datetime-local"
                      required
                      value={draft.at}
                      onChange={set('at')}
                      onKeyDown={onKey}
                      aria-label={t('field.consumedAt')}
                      autoFocus
                    />
                  </td>
                  <td>
                    <input
                      value={draft.category}
                      onChange={set('category')}
                      onKeyDown={onKey}
                      list={CATEGORY_LIST_ID}
                      size={8}
                      aria-label={t('field.category')}
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
                      aria-label={t('field.consumedCount')}
                    />
                  </td>
                  <td>
                    <ExpiryInput
                      value={draft.expiry}
                      onChange={(text) => setDraft((d) => ({ ...d, expiry: text }))}
                      onKeyDown={onKey}
                      ariaLabel={t('field.expiry')}
                    />
                  </td>
                  <td className="actions">
                    <button onClick={save} disabled={props.disabled || !valid}>
                      {t('action.done')}
                    </button>
                    <button onClick={() => setEditing(null)}>{t('action.cancel')}</button>
                    <button
                      className="danger"
                      onClick={() => props.onDelete(h.id)}
                      disabled={props.disabled}
                    >
                      {t('action.delete')}
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={h.id}>
                  <td>{formatDateTime(h.at)}</td>
                  <td>{h.category}</td>
                  <td>{h.content}</td>
                  <td className="num">{h.count}</td>
                  <td>{formatShortDate(h.expiry)}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEditing(h.id);
                        setDraft({
                          at: toDateTimeInput(h.at),
                          category: h.category,
                          content: h.content,
                          count: String(h.count),
                          expiry: formatShortDate(h.expiry),
                        });
                      }}
                      disabled={props.disabled}
                    >
                      {t('action.edit')}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}
