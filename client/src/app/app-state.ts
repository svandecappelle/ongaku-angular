import { ModuleWithProviders } from '@angular/core';
import { StoreModule, Action } from '@ngrx/store';

import { 
  PlayerStateRecord, 
  IPlayerState, 
  playerReducer 
} from './player/';

import { 
  PlaylistReducer
} from './player/controls/playlist/playlist-state';


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

export const AppStateModule : ModuleWithProviders = StoreModule.forRoot({
  player: playerReducer,
  trackList: PlaylistReducer
});
