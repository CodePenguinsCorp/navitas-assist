import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly authError = signal('');
  protected readonly passwordVisible = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/dashboard');
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.authError.set('Preencha os campos obrigatórios.');
      return;
    }

    const { username, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.authError.set('');

    this.authService.login({
      username,
      password
    }).pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/dashboard';
        void this.router.navigateByUrl(redirectTo);
      },
      error: () => {
        this.authError.set('Credenciais inválidas.');
      }
    });
  }

  protected hasError(controlName: 'username' | 'password'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((value) => !value);
  }
}
