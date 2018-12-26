import { VuMetterClassical } from './level-vumeter-classical';
import { VuMetterModern } from './level-vumeter-modern';

const THEME = 'MODERN';

export interface VuMetter {
    setValue(value);
}

export class VuMetterFactory {
    static get(context, channel): VuMetter {
        if (THEME === 'MODERN') {
            return new VuMetterModern(context, channel);
        } else {
            return new VuMetterClassical(context);
        }
    }
}