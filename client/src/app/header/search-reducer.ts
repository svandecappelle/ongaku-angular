import { Action } from '@ngrx/store';

import {
  SearchLibraryAction
} from './header-state';

export function searchReducer(state: String, action: SearchLibraryAction): String {

  if (!state) {
    state = '';
  }

  if (action && action.search) {
    return action.search;
  } else {
    return state;
  }
}
