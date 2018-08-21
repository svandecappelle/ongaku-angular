import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { HttpEventType, HttpResponse } from '@angular/common/http';

import { DomSanitizer } from '@angular/platform-browser';
import { UserService } from './user.service';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss']
})
export class UserComponent implements OnInit {

  private infos: any;

  private avatarSrc: string;
  private coverBackground: any;
  @ViewChild('avatarFiler', { read: ElementRef }) avatarFiler: ElementRef;
  @ViewChild('coverFiler', { read: ElementRef }) coverFiler: ElementRef;


  constructor(private service: UserService,
    private _sanitizer: DomSanitizer) { }

  ngOnInit() {
    this.service.getMyInfos().subscribe((data) => {
      this.infos = data;
      this.avatarSrc = `/static/user/${this.infos.username}/avatar?${new Date().getTime()}`;
      this.coverBackground = this.getImage('cover');
    });
  }

  getImage(type) {
    const image = `/static/user/${this.infos.username}/${type}?${new Date().getTime()}`;
    return this._sanitizer.bypassSecurityTrustStyle(`background-image: url(${image}); background-position: 50% 50%;`);
  }

  onSelectFile(type, event) {
    if(event.target.files && event.target.files.length > 0) {
      this.uploadFile(type, event.target.files);
    }
  }

  selectFile(type): void {
    if (type === 'avatar') {
      this.avatarFiler.nativeElement.click();
    } else if (type === 'cover') {
      this.coverFiler.nativeElement.click();
    }
    
  }

  uploadFile(type: String, files: FileList) {
    if (files.length == 0) {
      console.log("No file selected!");
      return

    }
    let file: File = files[0];

    this.service.uploadFile(`/api/user/image/${type}`, file)
      .subscribe(
        event => {
          if (event.type == HttpEventType.UploadProgress) {
            const percentDone = Math.round(100 * event.loaded / event.total);
            console.log(`File is ${percentDone}% loaded.`);
          } else if (event instanceof HttpResponse) {
            console.log('File is completely loaded!');
          }
        },
        (err) => {
          console.log("Upload Error:", err);
        }, () => {
          console.log("Upload done");
          this.avatarSrc = `/static/user/${this.infos.username}/avatar?${new Date().getTime()}`;
          this.coverBackground = this.getImage('cover');
        }
      )
  }
}
