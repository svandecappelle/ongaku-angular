/** A member, as listed by the users page (public fields only) */
export interface User {
    username: string;
    administrator: boolean;
    /** Tracks in the user's library */
    tracks: number;
    playlists: number;
}

export * from './users.service';
