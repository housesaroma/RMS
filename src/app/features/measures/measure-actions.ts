import { Dialog } from '@angular/cdk/dialog';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RiskDetails } from '../../core/models';
import { ACTIONS_WITH_FORM } from '../../core/risk-rules';
import { RisksApi } from '../../core/risks-api';
import { MeasureActionData, MeasureActionDialog } from './measure-action-dialog';

/** Runs a measure action: through the dialog when it needs input or ends the cycle, directly otherwise. */
@Service()
export class MeasureActions {
  private readonly dialog = inject(Dialog);
  private readonly api = inject(RisksApi);

  /** Resolves with the updated risk card, or undefined when the user cancelled. */
  run(data: MeasureActionData): Promise<RiskDetails | undefined> {
    if (!ACTIONS_WITH_FORM.includes(data.action) && !data.ends)
      return this.api.measureAction(data.measure.id, { action: data.action });
    const ref = this.dialog.open<RiskDetails>(MeasureActionDialog, {
      data,
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'dialog-backdrop',
      ariaLabelledBy: 'ma-title',
    });
    return firstValueFrom(ref.closed);
  }
}
