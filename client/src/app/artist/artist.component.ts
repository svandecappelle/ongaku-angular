import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute, Params } from '@angular/router';


import { ArtistService } from './artist.service';

@Component({
  selector: 'app-artist',
  templateUrl: './artist.component.html',
  styleUrls: ['./artist.component.scss']
})
export class ArtistComponent implements OnInit {

  private artist: string;
  private details: Object;
  private image;

  private covers: Object = {};

  constructor(
    private activatedRoute: ActivatedRoute, 
    private service: ArtistService,
    private _sanitizer: DomSanitizer) { }

  ngOnInit() {
    // subscribe to router event
    this.activatedRoute.params.subscribe((params: Params) => {
      this.artist = params['artist'];
      
      this.service.get(this.artist).subscribe((details) => {
        this.details = details;
        if (details) {
          this.image = this.getImageSrc(details.info);
          details.albums.forEach(album => {
            this.covers[album.album_info.title] = this.getImageSrc(album.album_info);
          });
        }
      });
    });
  }

  getArtistBackground(src) {
    const image = src.image ? src.image[3]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);
  }

  getImageSrc(src) {
    const image = src.image ? src.image[3]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
  }
}
