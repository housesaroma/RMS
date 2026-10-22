import { Component, computed, input } from '@angular/core';
import { Level, Thresholds, levelOf } from '../core/models';

const VAR: Record<Level, string> = {
  OWNER: 'owner',
  DIRECTOR: 'director',
  CEO: 'ceo',
  TREATMENT_REQUIRED: 'treatment',
};

/** 5×5 likelihood × impact matrix coloured by acceptance level, with an optional marked cell. */
@Component({
  selector: 'ui-heatmap',
  template: `
    <div class="map" role="img" [attr.aria-label]="label()">
      <span class="axis-y" aria-hidden="true">Вероятность</span>
      <div class="grid" aria-hidden="true">
        @for (row of rows(); track row.l) {
          <span class="tick">{{ row.l }}</span>
          @for (c of row.cells; track c.i) {
            <span class="cell" [class.mark]="c.mark" [style]="c.style">{{ c.r }}</span>
          }
        }
        <span></span>
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <span class="tick">{{ i }}</span>
        }
      </div>
      <span class="axis-x" aria-hidden="true">Тяжесть</span>
    </div>
    <div class="legend" aria-hidden="true">
      @for (lv of levels; track lv) {
        <span
          ><i
            [style.background]="
              'color-mix(in srgb, var(--lv-' + vars[lv] + '-hue) 60%, transparent)'
            "
          ></i
          >{{ lv }}</span
        >
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .map {
      display: grid;
      grid-template-columns: 16px 1fr;
      grid-template-rows: 1fr auto;
      gap: 4px;
    }
    .axis-y {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      align-self: center;
      justify-self: center;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .axis-x {
      grid-column: 2;
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: 14px repeat(5, minmax(0, 1fr));
      gap: 5px;
    }
    .tick {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: var(--muted);
    }
    .cell {
      height: 38px;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--fs-xs);
      color: var(--heat-fg);
    }
    .cell.mark {
      font-weight: 600;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      font-size: 11px;
      color: var(--muted);

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
    }
  `,
})
export class Heatmap {
  readonly thresholds = input.required<Thresholds>();
  /** [likelihood, impact] of the highlighted cell. */
  readonly mark = input<[number, number] | null>(null);
  readonly caption = input('');

  protected readonly levels: Level[] = ['OWNER', 'DIRECTOR', 'CEO', 'TREATMENT_REQUIRED'];
  protected readonly vars = VAR;

  protected readonly rows = computed(() => {
    const [ml, mi] = this.mark() ?? [0, 0];
    return [5, 4, 3, 2, 1].map((l) => ({
      l,
      cells: [1, 2, 3, 4, 5].map((i) => {
        const r = l * i;
        const v = VAR[levelOf(r, this.thresholds())];
        const mark = l === ml && i === mi;
        const style = mark
          ? `background: var(--heat-mark-bg, var(--lv-${v})); color: var(--heat-mark-fg, var(--lv-${v}-on)); box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px var(--lv-${v}-hue)`
          : `background: color-mix(in srgb, var(--lv-${v}-hue) var(--heat-alpha), transparent)`;
        return { i, r, mark, style };
      }),
    }));
  });

  protected readonly label = computed(() => {
    const m = this.mark();
    if (!m) return 'Тепловая карта рисков 5 × 5';
    const r = m[0] * m[1];
    return `Тепловая карта: ${this.caption()} в клетке вероятность ${m[0]}, тяжесть ${m[1]}, R = ${r}, зона ${levelOf(r, this.thresholds())}`;
  });
}
