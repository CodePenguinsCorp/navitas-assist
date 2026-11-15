import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Valores já usados nos campos de texto livre, para sugerir ao digitar (sem tela de cadastro). */
@Injectable({ providedIn: 'root' })
export class SuggestionService {
  private readonly injector = inject(Injector);

  interventionTypes(): Observable<string[]> {
    return this.read('intervention-types');
  }

  blockCategories(): Observable<string[]> {
    return this.read('block-categories');
  }

  partUnits(): Observable<string[]> {
    return this.read('part-units');
  }

  partLocations(): Observable<string[]> {
    return this.read('part-locations');
  }

  /** O cliente HTTP só é obtido quando um campo pede as sugestões (no primeiro foco). */
  private read(field: string): Observable<string[]> {
    return this.injector.get(HttpClient).get<string[]>(`/api/suggestions/${field}`);
  }
}
