import { TestBed, inject } from '@angular/core/testing';

import { InstallService } from './install.service';

describe('InstallService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [InstallService]
    });
  });

  it('should be created', inject([InstallService], (service: InstallService) => {
    expect(service).toBeTruthy();
  }));
});
