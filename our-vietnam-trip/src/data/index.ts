import { buildModel } from './model';
import { sampleData } from './sample';
import { tripData } from './trip';

const SAMPLE_KEY = 'ovt:sample';

/** Design preview: ?sample=1 turns it on for this tab, ?sample=0 turns it off. */
function sampleMode(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('sample');
    if (q === '1') sessionStorage.setItem(SAMPLE_KEY, '1');
    if (q === '0') sessionStorage.removeItem(SAMPLE_KEY);
    return sessionStorage.getItem(SAMPLE_KEY) === '1';
  } catch {
    return false;
  }
}

export const IS_SAMPLE = sampleMode();
export const model = buildModel(IS_SAMPLE ? sampleData : tripData);
export type { TripModel } from './model';
