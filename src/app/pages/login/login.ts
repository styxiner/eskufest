import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-login',
  template: `
    <section class="panel" aria-labelledby="login-title">
      <h2 id="login-title">Álbum privado</h2>
      <p>Inicia sesión para ver y compartir fotos y vídeos. Las cuentas nuevas necesitan la aprobación de un administrador.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" (click)="session.login()">Iniciar sesión</button>
        <button type="button" class="btn" (click)="session.signup()">Crear cuenta</button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly session = inject(SessionService);
}
