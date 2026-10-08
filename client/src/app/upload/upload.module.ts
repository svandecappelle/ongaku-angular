import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadComponent } from './upload.component';
import { MaterialModule } from '../modules/material.module';
import { DialogComponent } from './dialog/dialog.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { UploadService } from './upload.service';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { DetailsComponent } from './details/details.component';

@NgModule({ declarations: [UploadComponent, DialogComponent, DetailsComponent],
    exports: [UploadComponent, RouterModule], imports: [CommonModule, MaterialModule, BrowserAnimationsModule, RouterModule], providers: [UploadService, provideHttpClient(withXhr(), withInterceptorsFromDi())] })
export class UploadModule {}