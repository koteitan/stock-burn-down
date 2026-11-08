import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dayOfTime, recordsSince } from '../chart';
import { toDay } from '../date';
import { categoriesByUpdate } from '../lists';
import type { Lists } from '../types';
import { BurnDownChart } from './BurnDownChart';

export function Charts(props: {
  lists: Lists;
  chartStart: string;
  onChartStartChange: (iso: string) => void;
}) {
  const { lists, chartStart } = props;
  const { t } = useTranslation();
  const categories = categoriesByUpdate(lists);
  const start = toDay(chartStart);
  // Recomputed whenever the data changes, so the actual line reaches the latest record.
  const now = useMemo(() => dayOfTime(Date.now()), [lists]);

  return (
    <>
      <div className="chart-start">
        <label>
          {t('chartStart')}:
          <input
            type="date"
            value={chartStart}
            required
            onChange={(e) => {
              if (e.target.value) props.onChartStartChange(e.target.value);
            }}
          />
        </label>
      </div>
      {categories.length === 0 ? (
        <p className="empty">{t('emptyCharts')}</p>
      ) : (
        <div className="charts">
          {categories.map((category) => {
            const target = lists.targets.find((tg) => tg.category === category);
            const n = lists.stocks
              .filter((s) => s.category === category)
              .reduce((sum, s) => sum + s.count, 0);
            const c = recordsSince(lists.history, category, start).reduce(
              (sum, h) => sum + h.count,
              0,
            );
            return (
              <section className="card chart-card" key={`c:${category}`}>
                <div className="chart-head">
                  <h3>{category || t('noCategory')}</h3>
                  <div className="chart-sub">
                    <span>{t('chart.stockN', { n })}</span>
                    <span>{t('chart.consumedN', { n: c })}</span>
                    {target && <span>{t('chart.goal', { n: target.count })}</span>}
                    {target && n < target.count && (
                      <span className="short">⚠ {t('chart.short', { n: target.count - n })}</span>
                    )}
                  </div>
                </div>
                <div className="legend">
                  <span>
                    <span className="key key-actual" />
                    {t('chart.actual')}
                  </span>
                  <span>
                    <span className="key key-expiry" />
                    {t('chart.expiry')}
                  </span>
                  {target && (
                    <span>
                      <span className="key key-target" />
                      {t('chart.target')}
                    </span>
                  )}
                </div>
                <BurnDownChart
                  category={category}
                  lists={lists}
                  target={target}
                  start={start}
                  now={now}
                />
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
