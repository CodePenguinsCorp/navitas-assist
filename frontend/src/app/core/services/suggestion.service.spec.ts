import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SuggestionService } from './suggestion.service';

describe('SuggestionService', () => {
  it('lê cada lista de valores já usados da rota do campo', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(SuggestionService);
    const http = TestBed.inject(HttpTestingController);
    const results: Record<string, string[]> = {};
    const reads: [string, () => ReturnType<SuggestionService['partUnits']>][] = [
      ['intervention-types', () => service.interventionTypes()],
      ['block-categories', () => service.blockCategories()],
      ['part-units', () => service.partUnits()],
      ['part-locations', () => service.partLocations()]
    ];
    for (const [field, read] of reads) {
      read().subscribe(values => (results[field] = values));
      const request = http.expectOne(`/api/suggestions/${field}`);
      expect(request.request.method).toBe('GET');
      request.flush([`valor de ${field}`]);
    }
    expect(results).toEqual({
      'intervention-types': ['valor de intervention-types'],
      'block-categories': ['valor de block-categories'],
      'part-units': ['valor de part-units'],
      'part-locations': ['valor de part-locations']
    });
    http.verify();
  });
});
