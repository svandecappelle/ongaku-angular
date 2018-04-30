import { Map, Record } from 'immutable';

import { Song } from '../../app-state';

export interface IPlayerState extends Map<string,any> {
  isPlaying: boolean;
  track: Song;
  volume: number;
}

export const PlayerStateRecord = Record({
  isPlaying: false,
  track: null,
  volume: null
});