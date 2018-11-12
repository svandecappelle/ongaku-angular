import { Action } from '@ngrx/store';
// import { ITimes } from './state';

export class PlayerAction implements Action{
    constructor(public type, public payload){}
}


export class PlayerActions {
  static AUDIO_ENDED = 'AUDIO_ENDED';
  static AUDIO_PAUSED = 'AUDIO_PAUSED';
  static AUDIO_PLAYING = 'AUDIO_PLAYING';
  static AUDIO_TIME_UPDATED = 'AUDIO_TIME_UPDATED';
  static AUDIO_VOLUME_CHANGED = 'AUDIO_VOLUME_CHANGED';
  static PLAY_SELECTED_TRACK = 'PLAY_SELECTED_TRACK';


  audioEnded(): PlayerAction {
    return {
      type: PlayerActions.AUDIO_ENDED,
      payload: {}
    };
  }

  audioPaused(): PlayerAction {
    return {
      type: PlayerActions.AUDIO_PAUSED,
      payload: {}
    };
  }

  audioPlaying(): PlayerAction {
    return {
      type: PlayerActions.AUDIO_PLAYING,
      payload: {}
    };
  }
/*
  audioTimeUpdated(times: ITimes): Action {
    return {
      type: PlayerActions.AUDIO_TIME_UPDATED,
      payload: times
    };
  }
*/
  audioVolumeChanged(volume: number): PlayerAction {
    return {
      type: PlayerActions.AUDIO_VOLUME_CHANGED,
      payload: {
        volume
      }
    };
  }

  playSelectedTrack(track: any): PlayerAction {
    return {
      type: PlayerActions.PLAY_SELECTED_TRACK,
      payload: {
        track: track
      }
    };
  }
}