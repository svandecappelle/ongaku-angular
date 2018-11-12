import { Action } from '@ngrx/store';

import { Song } from '../../../app-state';

export enum TrackActionTypes {
    APPEND = '[Tracklist] Append',
    SET = '[Tracklist] Set'
}

export class SongAction implements Action {
    readonly type;

    constructor(public tracks) { }
}

export class AppendPlaylist extends SongAction {
    readonly type = TrackActionTypes.APPEND;
}

export class SetPlaylist extends SongAction {
    readonly type = TrackActionTypes.SET;
}

export type TrackActionsUnion =
    | AppendPlaylist
    | SetPlaylist;


export function PlaylistReducer(state: Song[], action: SongAction) {
    if (!state) {
        state = [];
    }

    switch (action.type) {
        case TrackActionTypes.APPEND: {
            return state.concat(action.tracks);
        }
        case TrackActionTypes.SET: {
            return action.tracks ? action.tracks : [];
        }
        default: {
            return state;
        }
    }
}