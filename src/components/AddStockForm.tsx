import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { StockInput } from '../useStore';
import { parseCount } from '../lists';
import { parseShortDate } from '../date';
import { CATEGORY_LIST_ID } from './CategoryList';
import { ExpiryInput } from './ExpiryInput';

export function AddStockForm(props: { disabled: boolean; onAdd: (input: StockInput) => void }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [count, setCount] = useState('');
  const [expiry, setExpiry] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const iso = parseShortDate(expiry);
    if (!iso) return;
    props.onAdd({
      category: category.trim(),
      content: content.trim(),
      count: parseCount(count),
      expiry: iso,
    });
    setContent('');
    setCount('');
    setExpiry('');
  };

  return (
    <form className="inline-form" onSubmit={submit}>
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
          {t('field.content')}:
          <input value={content} onChange={(e) => setContent(e.target.value)} size={14} />
        </label>
        <label>
          {t('field.count')}:
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
        <label>
          {t('field.expiry')}:
          <ExpiryInput value={expiry} onChange={setExpiry} />
        </label>
        <button type="submit">{t('action.add')}</button>
      </fieldset>
    </form>
  );
}
