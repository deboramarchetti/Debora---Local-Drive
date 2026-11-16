import { useEffect, useState } from 'react';
import { model } from './data';
import { todayIn } from './lib/time';

/** Today's date in Vietnam, refreshed every minute (handles midnight rollover). */
export function useToday() {
  const tz = model.trip.timeZone;
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    const t = setInterval(() => setToday(todayIn(tz)), 60_000);
    const vis = () => document.visibilityState === 'visible' && setToday(todayIn(tz));
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [tz]);
  return today;
}

/** The day the "Dia a dia" tab should open on. */
export function defaultDay(today: string) {
  const { startDate, endDate } = model.trip;
  if (today < startDate) return startDate;
  if (today > endDate) return startDate;
  return today;
}
