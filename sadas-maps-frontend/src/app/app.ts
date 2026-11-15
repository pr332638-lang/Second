import { Component } from '@angular/core';

import { DemoPageComponent } from './demo/demo-page.component';

/** Componente radice del prototipo: mostra solo la pagina di prova. */
@Component({
  selector: 'app-root',
  imports: [DemoPageComponent],
  template: '<sadas-demo-page />',
  styles: ':host { display: block; height: 100vh; }',
})
export class App {}
