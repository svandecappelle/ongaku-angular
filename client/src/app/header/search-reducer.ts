import { Action } from '@ngrx/store';

import {
  SearchLibraryAction
} from './header-state'

export function searchReducer(state: String, action: SearchLibraryAction): String {
  return action.search;
}