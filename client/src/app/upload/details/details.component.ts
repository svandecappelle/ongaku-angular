import { Component, Inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { UploadService } from '../upload.service';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss']
})
export class DetailsComponent {

  private sanitazedLocation;
  private progress;
  private canBeClosed = true;
  private primaryButtonText = 'Upload';
  private showCancelButton = true;
  private uploading = false;
  private uploadSuccessful = false;

  file;

  constructor(
    public dialogRef: MatDialogRef<DetailsComponent>,
    public uploadService: UploadService,
    private sanitizer: DomSanitizer,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.file = data.file;
    this.sanitazedLocation = sanitizer.bypassSecurityTrustResourceUrl(`/api/audio/my-library/${this.file.location}`);
  }

  addFiles() {
    this.file.nativeElement.click();
  }

  getProperties(details) {
    return Object.keys(details);
  }

  canPreview(file) {
    return file.name.toLowerCase().indexOf('.png') !== -1
      || file.name.toLowerCase().indexOf('.jpg') !== -1
      || file.name.toLowerCase().indexOf('.gif') !== -1
      || file.name.toLowerCase().indexOf('.jpeg') !== -1;
  }

  isPdf(file) {
    return file.name.toLowerCase().indexOf('.pdf') !== -1;
  }
}
