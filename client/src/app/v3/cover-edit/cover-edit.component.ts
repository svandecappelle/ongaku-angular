import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../../modules/material.module';
import { AdminService } from '../../services/admin.service';
import { AuthenticationService } from '../../services/authentication.service';

/**
 * Button over an artist picture or an album cover letting the administrators
 * replace the image or go back to the default one. Hidden for the other users.
 */
@Component({
  selector: 'app-cover-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  template: `
    @if (administrator()) {
      <button mat-mini-fab type="button" class="edit" [matMenuTriggerFor]="menu" [disabled]="busy()"
        [attr.aria-label]="'Change the image of ' + (album() ?? artist())" matTooltip="Change the image">
        @if (busy()) {
          <mat-spinner diameter="18"></mat-spinner>
        } @else {
          <mat-icon>edit</mat-icon>
        }
      </button>
      <mat-menu #menu="matMenu">
        <button mat-menu-item (click)="file.click()">
          <mat-icon>image</mat-icon>
          <span>Choose an image…</span>
        </button>
        <button mat-menu-item (click)="reset()">
          <mat-icon>settings_backup_restore</mat-icon>
          <span>Back to the default image</span>
        </button>
      </mat-menu>
      <input #file type="file" accept="image/*" hidden (change)="upload(file)">
    }
  `,
  styles: [`
    :host {
      position: absolute;
      right: 8px;
      bottom: 8px;
      z-index: 1;
    }
    .edit {
      color: var(--ongaku-on-accent);
      background: var(--ongaku-accent);
    }
  `],
})
export class CoverEditComponent {
  private readonly admin = inject(AdminService);
  private readonly snackBar = inject(MatSnackBar);

  readonly artist = input.required<string>();
  /** The image is the cover of this album of the artist; the artist picture otherwise */
  readonly album = input<string | undefined>(undefined);
  /** Emitted once the image changed, to reload it */
  readonly changed = output<void>();

  readonly administrator = toSignal(inject(AuthenticationService).isAdministrator(), { initialValue: false });
  readonly busy = signal(false);

  upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.run(this.admin.setImage(file, this.artist(), this.album()), 'Image changed');
    }
  }

  reset() {
    this.run(this.admin.resetImage(this.artist(), this.album()), 'Default image restored');
  }

  private run(request: ReturnType<AdminService['resetImage']>, message: string) {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.snackBar.open(message, undefined, { duration: 3000 });
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.snackBar.open(err.error?.message || 'The image could not be changed', undefined, { duration: 5000 });
      },
    });
  }
}
