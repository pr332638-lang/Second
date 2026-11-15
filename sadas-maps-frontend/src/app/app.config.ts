import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

import { mockBackendInterceptor } from './demo/mock-backend.interceptor';
import { requestLogInterceptor } from './demo/request-log.interceptor';

/**
 * Configurazione del prototipo.
 *
 * Di default la mappa parla con il back-end Java 21 (cartella backend/), raggiunto tramite il proxy
 * di "ng serve" (proxy.conf.json: /api → http://localhost:8080). Con ?backend=simulato nell'indirizzo
 * risponde invece mockBackendInterceptor, con dati generati nel browser.
 *
 * requestLogInterceptor riempie il registro delle richieste della pagina di prova, in entrambi i casi.
 * All'integrazione si tolgono entrambi: il componente mappa non cambia.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([requestLogInterceptor, mockBackendInterceptor])),
  ],
};
