import { bootstrapApplication } from '@angular/platform-browser';

import { installLocale } from './app/core/i18n/locale';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// `$localize` itself is installed by the `@angular/localize/init` polyfill (angular.json), which
// runs before this module — a direct import here would work but the builder warns about it, and
// the polyfill slot is what guarantees the ordering rather than merely achieving it.
//
// Translations are loaded before bootstrap: `$localize` resolves each message once, the first time
// it is evaluated, so a catalogue installed afterwards would leave whatever had already rendered
// in English. That is also why changing the locale in Settings reloads the page.
installLocale();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
