import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-error',
  imports: [RouterLink],
  template: `
    <section class="panel" role="alert" aria-labelledby="error-title">
      <h2 id="error-title">Algo ha fallado</h2>
      <p>No se ha podido completar la operación. Inténtalo de nuevo en unos minutos.</p>
      <div class="actions">
        <a class="btn btn-primary" routerLink="/album">Volver al álbum</a>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPage {}
