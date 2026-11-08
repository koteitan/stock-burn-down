import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, fromDateTimeInput, toDateTimeInput } from '../date';
import { compareRecord, parseCount } from '../lists';
import type { ConsumeRecord } from '../types';
import type { RecordInput } from '../useStore';
import { CATEGORY_LIST_ID } from './CategoryList';

interface Draft {
  at: string;
  category: string;
  content: string;
  count: string;
  expiry: string;
}

export function HistoryTable(props: {
  history: ConsumeRecord[];
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
  const valid = at !== null && draft.expiry !== '';
  const save = () => {
    if (!editing || at === null || !draft.expiry) return;
    props.onUpdate(editing, {
      at,
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

  const rows = [...props.history].sort((a, b) => compareRecord(b, a));

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
        <tbody>
          {rows.map((h) =>
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
                  <input
                    type="date"
                    required
                    value={draft.expiry}
                    onChange={set('expiry')}
                    onKeyDown={onKey}
                    aria-label={t('field.expiry')}
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
                <td>{formatDate(h.expiry)}</td>
                <td>
                  <button
                    onClick={() => {
                      setEditing(h.id);
                      setDraft({
                        at: toDateTimeInput(h.at),
                        category: h.category,
                        content: h.content,
                        count: String(h.count),
                        expiry: h.expiry,
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
      </table>
    </div>
  );
}
