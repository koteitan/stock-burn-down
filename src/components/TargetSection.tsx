import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../date';
import { parseCount } from '../lists';
import type { TargetItem } from '../types';
import type { TargetInput } from '../useStore';
import { CATEGORY_LIST_ID } from './CategoryList';

export function TargetSection(props: {
  targets: TargetItem[];
  disabled: boolean;
  onAdd: (input: TargetInput) => void;
  onUpdate: (id: string, input: TargetInput) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ category: '', count: '' });
  const [category, setCategory] = useState('');
  const [count, setCount] = useState('');

  const save = () => {
    if (!editing) return;
    props.onUpdate(editing, { category: draft.category.trim(), count: parseCount(draft.count) });
    setEditing(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(null);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    props.onAdd({ category: category.trim(), count: parseCount(count) });
    setCategory('');
    setCount('');
  };

  const rows = [...props.targets].sort((a, b) => a.category.localeCompare(b.category));

  return (
    <>
      {rows.length === 0 ? (
        <p className="empty">{t('emptyTargets')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('field.addedDate')}</th>
                <th>{t('field.category')}</th>
                <th className="num">{t('field.targetCount')}</th>
                <th>{t('field.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tg) =>
                editing === tg.id ? (
                  <tr key={tg.id} className="editing">
                    <td>{formatDate(tg.addedDate)}</td>
                    <td>
                      <input
                        value={draft.category}
                        onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                        onKeyDown={onKey}
                        list={CATEGORY_LIST_ID}
                        size={10}
                        aria-label={t('field.category')}
                        autoFocus
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.count}
                        onChange={(e) => setDraft((d) => ({ ...d, count: e.target.value }))}
                        onKeyDown={onKey}
                        className="num"
                        aria-label={t('field.targetCount')}
                      />
                    </td>
                    <td className="actions">
                      <button onClick={save} disabled={props.disabled}>
                        {t('action.done')}
                      </button>
                      <button onClick={() => setEditing(null)}>{t('action.cancel')}</button>
                      <button
                        className="danger"
                        onClick={() => props.onDelete(tg.id)}
                        disabled={props.disabled}
                      >
                        {t('action.delete')}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={tg.id}>
                    <td>{formatDate(tg.addedDate)}</td>
                    <td>{tg.category || t('noCategory')}</td>
                    <td className="num">{tg.count}</td>
                    <td>
                      <button
                        onClick={() => {
                          setEditing(tg.id);
                          setDraft({ category: tg.category, count: String(tg.count) });
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
      )}
      <form className="inline-form" onSubmit={add}>
        <fieldset disabled={props.disabled}>
          <label>
            {t('field.category')}:
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list={CATEGORY_LIST_ID}
              size={10}
            />
          </label>
          <label>
            {t('field.targetCount')}:
            <input
              type="number"
              min={1}
              step={1}
              placeholder="1"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="num"
            />
          </label>
          <button type="submit">{t('action.add')}</button>
        </fieldset>
      </form>
    </>
  );
}
