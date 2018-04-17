import { Map, Record } from 'immutable';


export interface IPlayerState extends Map<string,any> {
  isPlaying: boolean;
  track: Object;
  volume: number;
}

export const PlayerStateRecord = Record({
  isPlaying: false,
  track: null,
  volume: null
});