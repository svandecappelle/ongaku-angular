import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadComponent } from './upload.component';
import { MaterialModule } from '../modules/material.module';
import { DialogComponent } from './dialog/dialog.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { UploadService } from './upload.service';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { DetailsComponent } from './details/details.component';

@NgModule({
  imports: [CommonModule, MaterialModule, HttpClientModule, BrowserAnimationsModule, RouterModule],
  declarations: [UploadComponent, DialogComponent, DetailsComponent],
  exports: [UploadComponent, RouterModule],
  entryComponents: [DialogComponent, DetailsComponent], // Add the DialogComponent as entry component
  providers: [UploadService]
})
export class UploadModule {}