import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { take } from 'rxjs';

import { isPendingApprovalError, SessionService } from '../../core/auth/session.service';

/**
 * Target of Auth0 redirect errors (SDK `errorPath`). The error description comes from
 * the URL (attacker-controllable), so it is only compared, never displayed.
 */
@Component({
  selector: 'app-auth-error',
  template: `
    <section class="panel" role="alert" aria-labelledby="auth-error-title">
      <h2 id="auth-error-title">No se ha podido iniciar sesión</h2>
      <p>Ha ocurrido un problema al iniciar sesión. Inténtalo de nuevo.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="session.login()">Iniciar sesión</button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthErrorPage {
  protected readonly session = inject(SessionService);

  constructor() {
    const router = inject(Router);
    this.session.error$.pipe(take(1), takeUntilDestroyed(inject(DestroyRef))).subscribe((error) => {
      if (isPendingApprovalError(error)) void router.navigateByUrl('/pending', { replaceUrl: true });
    });
  }
}
