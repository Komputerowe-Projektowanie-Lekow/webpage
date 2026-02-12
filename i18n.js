import { translations } from './translations.js';

const STORAGE_KEY = 'sknwpl_language';
const DEFAULT_LANGUAGE = 'pl';

class I18n {
  constructor() {
    this.currentLanguage = this.loadLanguage();
    this.translations = translations;
  }

  loadLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'pl' || stored === 'en')) {
      return stored;
    }
    return DEFAULT_LANGUAGE;
  }

  saveLanguage(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  setLanguage(lang) {
    if (!this.translations[lang]) {
      console.error(`Language ${lang} not found`);
      return;
    }
    this.currentLanguage = lang;
    this.saveLanguage(lang);
    this.updatePage();
  }

  getCurrentLanguage() {
    return this.currentLanguage;
  }

  t(key) {
    const value = this.translations[this.currentLanguage]?.[key];
    if (value === undefined) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return value;
  }

  updatePage() {
    // Update meta tags
    document.documentElement.lang = this.currentLanguage;

    const pageMetaTags = document.querySelectorAll('meta[data-i18n-meta]');
    if (pageMetaTags.length > 0) {
      pageMetaTags.forEach((metaTag) => {
        const key = metaTag.getAttribute('data-i18n-meta');
        if (key) {
          metaTag.content = this.t(key);
        }
      });
    } else {
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.content = this.t('meta.description');
      }
    }

    const pageTitleTag = document.querySelector('title[data-i18n-meta]');
    if (pageTitleTag) {
      const key = pageTitleTag.getAttribute('data-i18n-meta');
      if (key) {
        const translatedTitle = this.t(key);
        pageTitleTag.textContent = translatedTitle;
        document.title = translatedTitle;
      }
    } else {
      document.title = this.t('meta.title');
    }

    // Update all elements with data-i18n attribute
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (key) {
        element.textContent = this.t(key);
      }
    });

    // Update all elements with data-i18n-html attribute (for HTML content)
    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    htmlElements.forEach(element => {
      const key = element.getAttribute('data-i18n-html');
      if (key) {
        element.innerHTML = this.t(key);
      }
    });

    // Update all elements with data-i18n-placeholder attribute
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (key) {
        element.placeholder = this.t(key);
      }
    });

    // Update language switcher active state
    this.updateLanguageSwitcher();

    // Dispatch custom event for other scripts to react to language change
    window.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language: this.currentLanguage } 
    }));
  }

  updateLanguageSwitcher() {
    const buttons = document.querySelectorAll('.lang-btn');
    buttons.forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      if (lang === this.currentLanguage) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  init() {
    // Apply current language on page load
    this.updatePage();

    // Setup language switcher buttons
    const buttons = document.querySelectorAll('.lang-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const lang = btn.getAttribute('data-lang');
        if (lang && lang !== this.currentLanguage) {
          this.setLanguage(lang);
        }
      });
    });
  }
}

// Create and export a singleton instance
export const i18n = new I18n();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('i18n: Initializing...');
    i18n.init();
    console.log('i18n: Initialized with language:', i18n.getCurrentLanguage());
  });
} else {
  console.log('i18n: Initializing (DOM already loaded)...');
  i18n.init();
  console.log('i18n: Initialized with language:', i18n.getCurrentLanguage());
}

// Make i18n available globally for debugging
window.i18n = i18n;


