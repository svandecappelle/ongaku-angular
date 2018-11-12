import { Action } from '@ngrx/store';
import { PlayerActions, PlayerAction } from '../player-actions';
import { IPlayerState, PlayerStateRecord } from './player-state';


export const initialState: IPlayerState = new PlayerStateRecord() as IPlayerState;


export function playerReducer(state: IPlayerState, { payload, type }: PlayerAction): IPlayerState {
  if (!state) {
    state = initialState;
  }
  switch (type) {
    case PlayerActions.AUDIO_ENDED:
    case PlayerActions.AUDIO_PAUSED:
      state.isPlaying = false;
      break;
    case PlayerActions.AUDIO_PLAYING:
      state.isPlaying = true;
      break;
    case PlayerActions.AUDIO_VOLUME_CHANGED:
      state.volume = payload.volume;
      break;
    case PlayerActions.PLAY_SELECTED_TRACK:
      state.track = payload.track;
      break;
    default:
      return state;
  }
  return {
    isPlaying: state.isPlaying,
    track: state.track,
    volume: state.volume
  };
}