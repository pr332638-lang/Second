import { Component, computed, input } from '@angular/core';
import type { LegendModel } from '../maps.models';
import { parseHexColor } from '../utils/scale';
import { formatValue } from '../utils/values';

/**
 * Legenda a barra orizzontale sotto la mappa, come nel componente originale:
 * sfumatura da Min Color a Max Color con i valori minimo, medio e massimo.
 * Per le bolle mostra anche il raggio minimo e massimo.
 */
@Component({
  selector: 'sadas-map-legend',
  template: `
    <div class="legend" role="group" [attr.aria-label]="ariaLabel()">
      <span class="legend__title">{{ model().title }}</span>
      <div class="legend__scale">
        <div class="legend__bar" [style.background]="gradient()"></div>
        <div class="legend__labels" aria-hidden="true">
          <span>{{ minLabel() }}</span>
          <span>{{ midLabel() }}</span>
          <span>{{ maxLabel() }}</span>
        </div>
      </div>
      @if (model().radius; as r) {
        <div class="legend__bubbles" aria-hidden="true">
          <span class="legend__bubble" [style.width.px]="r.min * 2" [style.height.px]="r.min * 2"></span>
          <span class="legend__bubble" [style.width.px]="r.max * 2" [style.height.px]="r.max * 2"></span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      background: var(--sadas-map-surface, #fff);
      color: var(--sadas-map-text, #1f2933);
      font-size: 12px;
    }
    .legend__title {
      font-weight: 600;
      white-space: nowrap;
      max-width: 30%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .legend__scale {
      flex: 1;
      min-width: 0;
    }
    .legend__bar {
      height: 10px;
      border-radius: 2px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    .legend__labels {
      display: flex;
      justify-content: space-between;
      margin-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    /* Bolle a grandezza reale, come sulla mappa: niente limiti di dimensione,
       altrimenti la bolla più grande risulterebbe più piccola di quella disegnata. */
    .legend__bubbles {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }
    .legend__bubble {
      display: inline-block;
      flex: none;
      box-sizing: border-box;
      border-radius: 50%;
      border: 1px solid currentColor;
      opacity: 0.6;
    }
  `,
})
export class MapLegendComponent {
  readonly model = input.required<LegendModel>();

  protected readonly minLabel = computed(() => '≤ ' + formatValue(this.model().min));
  protected readonly midLabel = computed(() => formatValue((this.model().min + this.model().max) / 2));
  protected readonly maxLabel = computed(() => '≥ ' + formatValue(this.model().max));

  protected readonly ariaLabel = computed(
    () => `Legenda ${this.model().title}: da ${formatValue(this.model().min)} a ${formatValue(this.model().max)}`,
  );

  protected readonly gradient = computed(() => {
    const m = this.model();
    return `linear-gradient(to right, ${rgba(m.minColor, m.minOpacity)}, ${rgba(m.maxColor, m.maxOpacity)})`;
  });
}

function rgba(hex: string, opacity: number): string {
  const [r, g, b] = parseHexColor(hex) ?? [158, 158, 158];
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
