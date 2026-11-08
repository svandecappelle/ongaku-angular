import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../../modules/material.module';
import { RadioStation } from '../../services/playback.service';
import { RadiosService, StreamTest } from '../../services/radios.service';
import { StationTileComponent } from './station-tile.component';

const STREAM_PATTERN = /^https?:\/\/\S+$/i;

function errorMessage(err: HttpErrorResponse, fallback: string): string {
  if (err.status === 0) {
    return 'The server cannot be reached.';
  }
  return err.status < 500 && err.error?.message ? err.error.message : fallback;
}

/**
 * Adds an internet station, or changes one (data: the station). The stream address can be
 * tested first: the name and genre the station sends fill the empty fields. The server tests
 * it again when saving. Closes with the saved station.
 */
@Component({
  selector: 'app-station-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule, StationTileComponent],
  template: `
    <h2 mat-dialog-title>{{ station ? 'Change the station' : 'Add a station' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <p class="muted intro">The address of an internet radio stream (Icecast, Shoutcast) or of its .pls or .m3u playlist. Every member can listen to it.</p>

        <div class="url-row">
          <mat-form-field>
            <mat-label>Stream address</mat-label>
            <input matInput formControlName="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" cdkFocusInitial>
            @if (form.controls.url.hasError('pattern')) {
              <mat-error>An address starting with http:// or https://</mat-error>
            }
          </mat-form-field>
          <button mat-stroked-button type="button" class="test" (click)="test()" [disabled]="testing() || form.controls.url.invalid">
            {{ testing() ? 'Testing…' : 'Test' }}
          </button>
        </div>

        @if (tested(); as result) {
          <p class="result ok" role="status">
            <mat-icon aria-hidden="true">check_circle</mat-icon>
            <span>
              <strong>The stream plays</strong>
              <span class="muted">{{ describe(result) }}</span>
            </span>
          </p>
        }
        @if (error(); as message) {
          <p class="result error" role="alert">
            <mat-icon aria-hidden="true">error_outline</mat-icon>
            <span class="error-text">{{ message }}</span>
          </p>
        }

        <div class="name-row">
          <app-station-tile [name]="form.controls.name.value || '?'" [size]="56"></app-station-tile>
          <mat-form-field>
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" maxlength="80" autocomplete="off">
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Genre</mat-label>
          <input matInput formControlName="genre" maxlength="40" autocomplete="off" placeholder="Jazz, Electronic, Talk…">
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving() || form.invalid">
          {{ saving() ? 'Checking the stream…' : station ? 'Save' : 'Add the station' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields {
      width: min(520px, 82vw);
      padding-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .muted {
      color: var(--ongaku-muted);
    }
    .intro {
      margin: 0 0 12px;
      font-size: 14px;
    }
    mat-form-field {
      width: 100%;
    }
    .url-row,
    .name-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .url-row mat-form-field,
    .name-row mat-form-field {
      flex: 1;
      min-width: 0;
    }
    .test {
      height: 56px;
    }
    .name-row app-station-tile {
      margin-top: 0;
    }
    .result {
      margin: 0 0 12px;
      padding: 10px 12px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 14px;
      border-radius: var(--ongaku-radius-md, 12px);
      span {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      mat-icon {
        flex: none;
      }
    }
    .result.ok {
      background: color-mix(in srgb, var(--ongaku-accent) 12%, transparent);
      mat-icon {
        color: var(--ongaku-accent);
      }
    }
    .result.error {
      background: color-mix(in srgb, #ff6b6b 14%, transparent);
      mat-icon {
        color: #ff8a8a;
      }
    }
  `],
})
export class StationDialogComponent {
  readonly station = inject<RadioStation | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly dialogRef = inject<MatDialogRef<StationDialogComponent, RadioStation>>(MatDialogRef);
  private readonly radios = inject(RadiosService);

  readonly form = new FormGroup({
    url: new FormControl(this.station?.url ?? '', { nonNullable: true, validators: [Validators.required, Validators.pattern(STREAM_PATTERN)] }),
    name: new FormControl(this.station?.name ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    genre: new FormControl(this.station?.genre ?? '', { nonNullable: true, validators: [Validators.maxLength(40)] }),
  });
  readonly testing = signal(false);
  readonly saving = signal(false);
  readonly tested = signal<StreamTest | null>(null);
  readonly error = signal<string | null>(null);

  describe(result: StreamTest): string {
    const parts = [result.type.replace('audio/', '').toUpperCase(), result.bitrate ? `${result.bitrate} kbps` : null,
      result.title ? `now playing “${result.title}”` : 'no title sent'];
    return parts.filter(Boolean).join(' · ');
  }

  test() {
    this.testing.set(true);
    this.tested.set(null);
    this.error.set(null);
    this.radios.test(this.form.controls.url.value.trim()).subscribe({
      next: (result) => {
        this.testing.set(false);
        this.tested.set(result);
        // What the station says about itself fills what is still empty
        if (!this.form.controls.name.value.trim() && result.name) {
          this.form.controls.name.setValue(result.name.slice(0, 80));
        }
        if (!this.form.controls.genre.value.trim() && result.genre) {
          this.form.controls.genre.setValue(result.genre.slice(0, 40));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.testing.set(false);
        this.error.set(errorMessage(err, 'The stream could not be tested.'));
      },
    });
  }

  save() {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const value = this.form.getRawValue();
    const fields = { name: value.name.trim(), url: value.url.trim(), genre: value.genre.trim() || null };
    this.saving.set(true);
    this.error.set(null);
    const request = this.station ? this.radios.update(this.station.id, fields) : this.radios.add(fields);
    request.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(errorMessage(err, 'The station could not be saved.'));
      },
    });
  }
}
