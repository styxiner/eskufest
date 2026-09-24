import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';

/** Placeholder until phase 5 (album UI). */
@Component({
  selector: 'app-album',
  template: `
    <section aria-labelledby="album-title">
      <h2 id="album-title">Álbum</h2>
      <p>
        Sesión iniciada{{ session.user()?.email ? ' como ' + session.user()?.email : '' }}.
        @if (session.me()?.role === 'admin') {
          (administrador)
        }
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumPage {
  protected readonly session = inject(SessionService);
}
