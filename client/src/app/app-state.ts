import { ModuleWithProviders } from '@angular/core';
import { StoreModule, Action } from '@ngrx/store';

import {
  PlayerStateRecord,
  IPlayerState,
  playerReducer
} from './player/';

import {
  searchReducer
} from './header/search-reducer';

import {
  PlaylistReducer
} from './player/controls/playlist/playlist-state';


export interface IAppState {
  readonly search: String;
  readonly player: IPlayerState;
  readonly trackList: Song[];
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

export const AppStateModule: ModuleWithProviders = StoreModule.forRoot({
  search: searchReducer,
  player: playerReducer,
  trackList: PlaylistReducer
});
