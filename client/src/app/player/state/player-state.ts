import { Map, Record } from 'immutable';

import { Song } from '../../app-state';

export interface IPlayerState {
  isPlaying: boolean;
  track: Song;
  volume: number;
}

export class PlayerStateRecord implements IPlayerState {
  isPlaying = false;
  track = null;
  volume = null;
};