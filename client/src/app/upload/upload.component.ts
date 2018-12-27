import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material';
import { DialogComponent } from './dialog/dialog.component';
import { DetailsComponent } from './details/details.component';
import { UploadService } from './upload.service';

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss']
})
export class UploadComponent implements OnInit {

  private files: string[];
  private folder: string;
  private folderName: string;

  constructor(public dialog: MatDialog, 
    public uploadService: UploadService,
    public route: ActivatedRoute,
    public router: Router) {
  }

  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      this.folder = params['folder'];

      this.uploadService.list(this.folder ? this.folder : '').subscribe(content => {
        this.files = content.files;
        this.folderName = content.location;
      });
    });
  }

  details(file, event) {
    event.preventDefault();
    event.stopPropagation();

    let dialogRef = this.dialog.open(DetailsComponent, { width: '50%', height: '50%', data: { file: file } });
    dialogRef.afterClosed().subscribe(() => {
      // nothing to do
    });
  }

  public openUploadDialog() {
    let dialogRef = this.dialog.open(DialogComponent, { width: '50%', height: '50%', data: { folder: this.folder } });
    dialogRef.afterClosed().subscribe(() => {
      this.uploadService.list(this.folder ? this.folder : '').subscribe(content => {
        this.files = content.files;
        this.folder = 'content.location';
      });
    });
  }

  directories(files) {
    let directories = [];
    files.forEach(file => {
      if (file.type === 'directory') {
        directories.push(file);
      }
    });
    return directories;
  }

  regularFiles(files) {
    let regularFiles = [];
    files.forEach(file => {
      if (file.type !== 'directory') {
        regularFiles.push(file);
      }
    });
    return regularFiles;
  }

  getFileIcon(file) {
    if (file.type === 'directory'){
      return 'folder';
    } else {
      const imagesExtensions = [
        '.jpg',
        '.gif',
        '.png'
      ];
      let icon = '';
      imagesExtensions.forEach(ext => {
        if (file.name.toLowerCase().indexOf(ext) !== -1) {
          icon = 'photo';
        }
      });

      const audioExtensions = [
        '.mp3',
        '.wav',
        '.flac',
        '.wma'
      ];
      audioExtensions.forEach(ext => {
        if (file.name.toLowerCase().indexOf(ext) !== -1) {
          icon = 'audiotrack';
        }
      });

      if (!icon) {
        icon = 'insert_drive_file';
      }

      return icon;
    }
  }
}