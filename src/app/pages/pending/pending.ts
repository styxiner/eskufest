import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-pending',
  template: `
    <section class="panel" aria-labelledby="pending-title">
      <h2 id="pending-title">Cuenta pendiente de aprobación</h2>
      <p>Tu cuenta se ha creado, pero un administrador todavía tiene que darte acceso al álbum.</p>
      <p>Cuando te aprueben, vuelve a iniciar sesión.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="session.login()">Volver a intentarlo</button>
        <button type="button" class="btn" (click)="session.logout()">Usar otra cuenta</button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingPage {
  protected readonly session = inject(SessionService);
}
