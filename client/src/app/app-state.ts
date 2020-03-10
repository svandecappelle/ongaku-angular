import { ModuleWithProviders } from '@angular/core';
import { StoreModule } from '@ngrx/store';

import {
  IPlayerState,
  playerReducer
} from './player/';

import {
  searchReducer
} from './header/search-reducer';

import {
  backgroundUserReducer
} from './content/content-state';

import {
  PlaylistReducer
} from './player/controls/playlist/playlist-state';


export interface IAppState {
  readonly search: String;
  readonly player: IPlayerState;
  readonly trackList: Song[];
  readonly showBackgroundOnViews: boolean;
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
  metadatas: Object;
  artistDetails: Object;
  waveform?: String;
}

export const AppStateModule: ModuleWithProviders = StoreModule.forRoot({
  search: searchReducer,
  player: playerReducer,
  trackList: PlaylistReducer,
  showBackgroundOnViews: backgroundUserReducer
});
