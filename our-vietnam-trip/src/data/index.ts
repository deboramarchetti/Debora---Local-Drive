import { buildModel } from './model';
import { sampleData } from './sample';
import { tripData } from './trip';
import { applyLocal, loadLocal } from '../lib/localStore';
import { forParty } from '../lib/viewer';

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
/** Changes saved on this phone (applied on top of the published itinerary). */
export const localStore = loadLocal();
/** The itinerary as this phone's party lives it, with this phone's changes applied. */
export const model = buildModel(IS_SAMPLE ? sampleData : forParty(applyLocal(tripData, localStore)));
export type { TripModel } from './model';
