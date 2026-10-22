import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('toggles the theme on the document root', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = document.documentElement;
    const before = root.dataset['theme'] ?? 'dark';

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();

    expect(root.dataset['theme']).toBe(before === 'dark' ? 'glass' : 'dark');
  });
});
