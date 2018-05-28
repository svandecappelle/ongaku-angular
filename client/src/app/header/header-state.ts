import { Action } from '@ngrx/store';

export class SearchLibraryAction implements Action {
    readonly type = '[HEADER] SEARCH';

    constructor(public search: String) {}
}
