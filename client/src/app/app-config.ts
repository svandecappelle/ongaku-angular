declare const SOUNDCLOUD_CLIENT_ID;

//=========================================================
//  APP CONFIG
//---------------------------------------------------------
export const APP_NAME = 'ongaku-ngrx';


//=====================================
//  API
//-------------------------------------
export const PAGINATION_LIMIT = 60;
export const PAGINATION_PARAMS = `limit=${PAGINATION_LIMIT}&linked_partitioning=1`;


//=====================================
//  IMAGES
//-------------------------------------
export const IMAGE_DEFAULT_SIZE = 'large.jpg';
export const IMAGE_XLARGE_SIZE = 't500x500.jpg';


//=====================================
//  PLAYER
//-------------------------------------
export const PLAYER_INITIAL_VOLUME = 10;
export const PLAYER_MAX_VOLUME = 100;
export const PLAYER_VOLUME_INCREMENT = 5;

export const PLAYER_STORAGE_KEY = `${APP_NAME}:player`;


//=====================================
//  TRACKLISTS
//-------------------------------------
export const TRACKS_PER_PAGE = 12;


//=====================================
//  WAVEFORMS
//-------------------------------------

