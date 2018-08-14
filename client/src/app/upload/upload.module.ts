import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadComponent } from './upload.component';
import { MatButtonModule, MatDialogModule, MatListModule, MatProgressBarModule, MatIconModule } from '@angular/material';
import { DialogComponent } from './dialog/dialog.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { UploadService } from './upload.service';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';

@NgModule({
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatListModule, MatIconModule, HttpClientModule, BrowserAnimationsModule, MatProgressBarModule, RouterModule],
  declarations: [UploadComponent, DialogComponent],
  exports: [UploadComponent, RouterModule],
  entryComponents: [DialogComponent], // Add the DialogComponent as entry component
  providers: [UploadService]
})
export class UploadModule {}