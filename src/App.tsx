import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AddStockForm } from './components/AddStockForm';
import { CategoryList } from './components/CategoryList';
import { Charts } from './components/Charts';
import { HistoryTable } from './components/HistoryTable';
import { Menu } from './components/Menu';
import { StockTable } from './components/StockTable';
import { TargetSection } from './components/TargetSection';
import { toDay } from './date';
import { forcedLang, todayNow } from './debug';
import { categoriesByUpdate, categoriesOf } from './lists';
import type { Theme } from './types';
import { useStore } from './useStore';

function useTheme(theme: Theme) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
    };
    apply();
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings, lists, nostrStatus, editable, actions } = useStore();
  const today = useMemo(() => toDay(todayNow()), []);
  const categories = categoriesOf(lists);

  useTheme(settings.theme);
  useEffect(() => {
    // changeLanguage() emits languageChanged even for the current language, which re-renders.
    const lang = forcedLang ?? settings.lang;
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [i18n, settings.lang]);
  useEffect(() => {
    document.title = t('title');
  }, [t]);

  const status = settings.storage === 'nostr' && nostrStatus ? nostrStatus : null;

  return (
    <>
      <header className="app-header">
        <h1>{t('title')}</h1>
        {status && (
          <span className={`nostr-status status-${status}`} role="status">
            {t(`status.${status}`)}
          </span>
        )}
        <Menu settings={settings} onChange={updateSettings} />
      </header>
      <main>
        <Charts
          lists={lists}
          chartStart={settings.chartStart}
          onChartStartChange={(chartStart) => updateSettings({ chartStart })}
        />

        <h2>{t('section.add')}</h2>
        <AddStockForm disabled={!editable} onAdd={actions.addStock} />
        {!editable && status === 'loading' && <p className="note">{t('readOnly')}</p>}

        <h2>{t('section.stocks')}</h2>
        <StockTable
          stocks={lists.stocks}
          today={today}
          disabled={!editable}
          sort={settings.stockSort}
          onSortChange={(stockSort) => updateSettings({ stockSort })}
          onConsume={actions.consumeOne}
          onUpdate={actions.updateStock}
          onDelete={actions.deleteStock}
        />

        <h2>{t('section.targets')}</h2>
        <TargetSection
          targets={lists.targets}
          disabled={!editable}
          onAdd={actions.addTarget}
          onUpdate={actions.updateTarget}
          onDelete={actions.deleteTarget}
        />
        <h2>{t('section.history')}</h2>
        <HistoryTable
          history={lists.history}
          categoryOrder={categoriesByUpdate(lists)}
          chartStart={settings.chartStart}
          onDeleteBefore={(category) =>
            actions.deleteRecordsBefore(toDay(settings.chartStart), category)
          }
          disabled={!editable}
          onUpdate={actions.updateRecord}
          onDelete={actions.deleteRecord}
        />
        <CategoryList categories={categories} />
      </main>
    </>
  );
}
