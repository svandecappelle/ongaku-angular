import { Action } from '@ngrx/store';

import {
  SearchLibraryAction
} from './header-state';

export function searchReducer(state: String, action: SearchLibraryAction): String {

  if (state === undefined) {
    state = '';
  }

  if (action && action.search !== undefined) {
    return action.search;
  } else {
    return state;
  }
}
