import { ModuleWithProviders } from '@angular/core';
import { StoreModule } from '@ngrx/store';

export interface IAppState {

}

export interface Song {
  audio: String;
}

export const AppStateModule : ModuleWithProviders = StoreModule.forRoot({a: 'toto'});