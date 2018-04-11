import 'rxjs/add/operator/let';
import 'rxjs/add/operator/pluck';

import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs/Observable';
import { IPlayerState } from './state/player-state';
import { getPlayer, getPlayerTrack, getPlayerTracklistCursor, getTimes } from './state/selectors';
import { ITimesState } from './state';
import { AudioService } from './audio-service';
import { AudioSource } from './audio-source';
import { PlayerActions } from './player-actions';
import { playerStorage } from './player-storage';


@Injectable()
export class PlayerService extends AudioService {
  currentTime$: Observable<number>;
  player$: Observable<IPlayerState>;
  times$: Observable<ITimesState>;


  constructor(private actions: PlayerActions, audio: AudioSource, private store$: Store<IAppState>) {
    super(actions, audio);

    this.events$.subscribe(action => store$.dispatch(action));
    this.volume = playerStorage.volume || 1;

    this.cursor$ = store$.let(getPlayerTracklistCursor());
    this.player$ = store$.let(getPlayer());

    this.track$ = store$.let(getPlayerTrack());
    this.track$.subscribe(track => this.play(track.streamUrl));

    this.times$ = store$.let(getTimes());
    this.currentTime$ = this.times$.pluck('currentTime');
  }


  select({trackId, tracklistId}: {trackId: number, tracklistId?: string}): void {
    this.store$.dispatch(
      this.actions.playSelectedTrack(trackId, tracklistId)
    );
  }
}
