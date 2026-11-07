import { ModuleWithProviders } from '@angular/core';
import { StoreModule, StoreRootModule } from '@ngrx/store';

import { IPlayerState } from './state/player-state';
import { playerReducer } from './state/player-reducer';
import { searchReducer } from './state/search-reducer';
import { backgroundUserReducer } from './state/content-state';
import { PlaylistReducer } from './state/playlist-state';


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

export const AppStateModule: ModuleWithProviders<StoreRootModule> = StoreModule.forRoot({
  search: searchReducer,
  player: playerReducer,
  trackList: PlaylistReducer,
  showBackgroundOnViews: backgroundUserReducer
});
