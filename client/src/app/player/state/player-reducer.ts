import { Action } from '@ngrx/store';
import { PlayerActions, PlayerAction } from '../player-actions';
import { IPlayerState, PlayerStateRecord } from './player-state';


export const initialState: IPlayerState = new PlayerStateRecord() as IPlayerState;


export function playerReducer(state: IPlayerState = initialState, {payload, type}: PlayerAction): IPlayerState {
  switch (type) {
    case PlayerActions.AUDIO_ENDED:
    case PlayerActions.AUDIO_PAUSED:
      return state.set('isPlaying', false) as IPlayerState;

    case PlayerActions.AUDIO_PLAYING:
      return state.set('isPlaying', true) as IPlayerState;

    case PlayerActions.AUDIO_VOLUME_CHANGED:
      return state.set('volume', payload.volume) as IPlayerState;

    case PlayerActions.PLAY_SELECTED_TRACK:
      return state.set('track', payload.track) as IPlayerState;

    default:
      return state;
  }
}