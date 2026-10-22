import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'glass';

const KEY = 'rms.theme';

@Service()
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  // index.html applies the stored theme before bootstrap, so start from the attribute.
  readonly theme = signal<Theme>(
    this.doc.documentElement.dataset['theme'] === 'glass' ? 'glass' : 'dark',
  );

  constructor() {
    effect(() => {
      const t = this.theme();
      this.doc.documentElement.dataset['theme'] = t;
      try {
        localStorage.setItem(KEY, t);
      } catch {}
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'glass' : 'dark'));
  }
}
