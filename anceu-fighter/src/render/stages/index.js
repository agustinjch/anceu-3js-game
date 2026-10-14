import { buildPlaza } from './plaza.js';
import { buildPonte } from './ponte.js';

export const STAGES = {
  plaza: { name: 'Praza da igrexa', build: buildPlaza, blurb: 'Anceu Fest, tarde de xullo' },
  ponte: { name: 'Ponte do Verdugo', build: buildPonte, blurb: 'Solpor sobre o río' },
};
export const STAGE_LIST = ['plaza', 'ponte'];
