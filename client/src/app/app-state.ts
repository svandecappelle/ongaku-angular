import { ModuleWithProviders } from '@angular/core';
import { StoreModule, Action } from '@ngrx/store';

import { PlayerStateRecord, IPlayerState, playerReducer } from './player/';

export interface IAppState {
  readonly player: IPlayerState;
  readonly trackList: Object[];
}

export interface Song {
  uid: String;
  album: String;
  artist: String;
  file: String;
  state: String;
  type: String;
  title: String;
  genre: String;
  index: number;
}

export enum TrackActionTypes {
  APPEND = '[Track] Append'
}

export class SongAction implements Action {
  readonly type = TrackActionTypes.APPEND;

  constructor (public tracks){};
}

export class Append extends SongAction {
  
}

export type TrackActionsUnion =
| Append;


export function reducer(state: Object[], action: SongAction) {
  
  if (!state){
    state = [];
  }

  switch(action.type) {
    case TrackActionTypes.APPEND: {
      return state.concat(action.tracks);
    }

    default: {
      return state;
    }
  }
}

export const AppStateModule : ModuleWithProviders = StoreModule.forRoot({
  player: playerReducer,
  trackList: reducer
});
