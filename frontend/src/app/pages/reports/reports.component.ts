import { Component } from '@angular/core';
import { ACCESS_MATRIX, REPORT_CARDS, ROLE_LABELS, SECURITY_POLICIES } from '../../core/mock-data';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styles: [':host { display: block; }']
})
export class ReportsComponent {
  protected readonly reports = REPORT_CARDS;
  protected readonly policies = SECURITY_POLICIES;
  protected readonly accessMatrix = ACCESS_MATRIX;
  protected readonly roleLabels = ROLE_LABELS;
}
