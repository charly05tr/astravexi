import { Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import { expiryStatus, stockLevel } from '../../core/medical/model';
import type { Medication, StockSummary } from '../../core/medical/model';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState, Panel } from '../../ui/Panel';
import { CATEGORY_LABEL, EXPIRY_LABEL, STOCK_LABEL } from './medical-labels';

export interface MedicationStockActions {
  onAdd(): void;
  onEdit(medication: Medication): void;
  onDelete(medication: Medication): void;
}

function SummaryItem({ label, value, attention }: { label: string; value: number; attention?: boolean }) {
  return (
    <li className="item" data-attention={attention && value > 0 ? 'true' : undefined}>
      <span className="eyebrow">{label}</span>
      <strong className="stock-summary__value">{value}</strong>
    </li>
  );
}

/** The medical kit: a summary, then one row per medication. Presentational: no store access. */
export function MedicationStockPanel({
  medications,
  summary,
  today,
  actions,
}: {
  medications: readonly Medication[];
  summary: StockSummary;
  today: string;
  actions: MedicationStockActions;
}) {
  return (
    <Panel
      id="medication-stock"
      title="Medication stock"
      icon={<Pill size={18} aria-hidden="true" />}
      hint={`Crew medical kit, as of ${today}. Low stock is at or below the minimum; expiring soon is within 90 days.`}
    >
      <ul className="stock-summary" aria-label="Stock summary">
        <SummaryItem label="Medications" value={summary.total} />
        <SummaryItem label="Low stock" value={summary.lowStock} attention />
        <SummaryItem label="Expiring soon" value={summary.expiringSoon} attention />
        <SummaryItem label="Expired" value={summary.expired} attention />
      </ul>
      <div className="proposal__actions stock-toolbar">
        <Button variant="primary" size="small" onClick={actions.onAdd}>
          <Plus size={14} aria-hidden="true" />
          Add medication
        </Button>
      </div>
      {medications.length === 0 ? (
        <EmptyState>No medications in the kit yet.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table stock-table" aria-label="Medications">
            <thead>
              <tr>
                <th scope="col">Medication</th>
                <th scope="col">Category</th>
                <th scope="col">Quantity</th>
                <th scope="col">Minimum</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {medications.map((m) => {
                const stock = stockLevel(m);
                const expiry = expiryStatus(m, today);
                return (
                  <tr key={m.id} data-medication-id={m.id}>
                    <th scope="row">
                      <strong>{m.name}</strong>
                      <span className="item__meta">{[m.form, m.strength].filter(Boolean).join(' · ')}</span>
                    </th>
                    <td>{CATEGORY_LABEL[m.category]}</td>
                    <td>
                      {m.quantity} {m.unit}
                    </td>
                    <td>{m.minStock}</td>
                    <td>{m.expiresOn}</td>
                    <td>
                      <span className="badges">
                        {stock !== 'ok' ? <Badge variant="solid">{STOCK_LABEL[stock]}</Badge> : null}
                        {expiry !== 'ok' ? <Badge variant="solid">{EXPIRY_LABEL[expiry]}</Badge> : null}
                        {stock === 'ok' && expiry === 'ok' ? <Badge>OK</Badge> : null}
                      </span>
                    </td>
                    <td className="stock-table__actions">
                      <span className="badges">
                        <Button size="small" aria-label={`Edit ${m.name}`} onClick={() => actions.onEdit(m)}>
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                        <Button size="small" aria-label={`Delete ${m.name}`} onClick={() => actions.onDelete(m)}>
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
