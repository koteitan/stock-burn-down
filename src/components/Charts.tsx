import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dayOfTime, recordsSince, type CategoryFilter } from '../chart';
import { toDay } from '../date';
import { nowMs } from '../debug';
import { categoriesByUpdate } from '../lists';
import type { Lists } from '../types';
import { BurnDownChart } from './BurnDownChart';

const inCategory = (item: { category: string }, category: CategoryFilter) =>
  category === null || item.category === category;

function ChartCard(props: {
  category: CategoryFilter;
  title: string;
  lists: Lists;
  start: number;
  end: number | null;
  now: number;
}) {
  const { category, lists, start } = props;
  const { t } = useTranslation();
  const targets = lists.targets.filter((tg) => inCategory(tg, category));
  const goal = targets.length > 0 ? targets.reduce((sum, tg) => sum + tg.count, 0) : null;
  const n = lists.stocks
    .filter((s) => inCategory(s, category))
    .reduce((sum, s) => sum + s.count, 0);
  const c = recordsSince(lists.history, category, start).reduce((sum, h) => sum + h.count, 0);

  return (
    <section className={`card chart-card${category === null ? ' chart-overall' : ''}`}>
      <div className="chart-head">
        <h3>{props.title}</h3>
        <div className="chart-sub">
          <span>{t('chart.stockN', { n })}</span>
          <span>{t('chart.consumedN', { n: c })}</span>
          {goal !== null && <span>{t('chart.goal', { n: goal })}</span>}
          {goal !== null && n < goal && (
            <span className="short">⚠ {t('chart.short', { n: goal - n })}</span>
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
        {goal !== null && (
          <span>
            <span className="key key-target" />
            {t('chart.target')}
          </span>
        )}
      </div>
      <BurnDownChart
        category={category}
        title={props.title}
        lists={lists}
        goal={goal}
        start={start}
        end={props.end}
        now={props.now}
      />
    </section>
  );
}

export function Charts(props: {
  lists: Lists;
  chartStart: string;
  chartEnd: string;
  onRangeChange: (range: { chartStart?: string; chartEnd?: string }) => void;
}) {
  const { lists, chartStart, chartEnd } = props;
  const { t } = useTranslation();
  const categories = categoriesByUpdate(lists);
  const start = toDay(chartStart);
  const endInvalid = chartEnd !== '' && chartEnd < chartStart;
  const end = chartEnd === '' || endInvalid ? null : toDay(chartEnd);
  // Recomputed whenever the data changes, so the actual line reaches the latest record.
  const now = useMemo(() => dayOfTime(nowMs()), [lists]);

  return (
    <>
      <div className="chart-range">
        <span>{t('chartRange')}:</span>
        <input
          type="date"
          value={chartStart}
          required
          aria-label={t('chartRangeStart')}
          onChange={(e) => {
            if (e.target.value) props.onRangeChange({ chartStart: e.target.value });
          }}
        />
        <span aria-hidden="true">--</span>
        <input
          type="date"
          value={chartEnd}
          min={chartStart}
          aria-label={t('chartRangeEnd')}
          aria-invalid={endInvalid}
          onChange={(e) => props.onRangeChange({ chartEnd: e.target.value })}
        />
      </div>
      {categories.length === 0 ? (
        <p className="empty">{t('emptyCharts')}</p>
      ) : (
        <div className="charts">
          {categories.map((category) => (
            <ChartCard
              key={`c:${category}`}
              category={category}
              title={category || t('noCategory')}
              lists={lists}
              start={start}
              end={end}
              now={now}
            />
          ))}
          <ChartCard
            key="overall"
            category={null}
            title={t('chart.overall')}
            lists={lists}
            start={start}
            end={end}
            now={now}
          />
        </div>
      )}
    </>
  );
}
