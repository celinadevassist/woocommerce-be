// شرح
// https://www.youtube.com/watch?v=lvP_64LjyZU
const { I18n } = require('i18n');

import ar from './locales/ar';
import en from './locales/en';

export const i18n = new I18n({
  locales: ['en', 'ar'],
  directory: './locales',
  defaultLocale: 'en',
  retryInDefaultLocale: true,
  autoReload: true,
  staticCatalog: {
    ar,
    en,
  },
})
