import { PlayerActions, PlayerAction } from './player-actions';
import { IPlayerState, PlayerStateRecord } from './player-state';


export const initialState: IPlayerState = new PlayerStateRecord() as IPlayerState;


export function playerReducer(state: IPlayerState = initialState, { payload, type }: PlayerAction): IPlayerState {
  // The store freezes its state: changes make a new object
  switch (type) {
    case PlayerActions.AUDIO_ENDED:
    case PlayerActions.AUDIO_PAUSED:
      return { ...state, isPlaying: false };
    case PlayerActions.AUDIO_PLAYING:
      return { ...state, isPlaying: true };
    case PlayerActions.AUDIO_VOLUME_CHANGED:
      return { ...state, volume: payload.volume };
    case PlayerActions.PLAY_SELECTED_TRACK:
      return { ...state, track: payload.track };
    default:
      return state;
  }
}
