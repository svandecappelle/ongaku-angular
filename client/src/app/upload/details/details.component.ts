import { Component, OnInit, ViewChild, Inject } from '@angular/core';
import { MatDialogRef } from '@angular/material';
import { UploadService } from '../upload.service';
import { forkJoin } from 'rxjs';
import { MAT_DIALOG_DATA } from '@angular/material';

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss']
})
export class DetailsComponent {

  private file;

  progress;
  canBeClosed = true;
  primaryButtonText = 'Upload';
  showCancelButton = true;
  uploading = false;
  uploadSuccessful = false;

  constructor(public dialogRef: MatDialogRef<DetailsComponent>, public uploadService: UploadService,
    @Inject(MAT_DIALOG_DATA) public data: any) {
    this.file = data.file;
  }

  addFiles() {
    this.file.nativeElement.click();
  }

  getProperties(details) {
    return Object.keys(details);
  }

  canPreview(file) {
    return file.name.toLowerCase().indexOf('.png')
      || file.name.toLowerCase().indexOf('.jpg')
      || file.name.toLowerCase().indexOf('.gif')
      || file.name.toLowerCase().indexOf('.jpeg');
  }
}
