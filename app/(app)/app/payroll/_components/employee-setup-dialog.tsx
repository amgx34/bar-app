'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Employee, TipMode, saveEmployee } from '../actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Info } from 'lucide-react';

const ROLES = [
  { value: 'bartender', label: 'Bartender' },
  { value: 'barback', label: 'Barback' },
  { value: 'server', label: 'Server' },
  { value: 'security', label: 'Security' },
  { value: 'manager', label: 'Manager' },
  { value: 'other', label: 'Other' },
];

const TIP_MODE_INFO: Record<string, string> = {
  pool: 'Tips are pooled and distributed proportionally based on hours worked',
  individual: 'Each employee keeps their own tracked tips (requires per-employee tip data in Z report imports)',
  sales_pct: "Tips are distributed based on each employee's sales percentage from Z report data",
  barback: '15% of each night\'s total tip pool is split equally among all barbacks on shift',
  no_tip: 'Employee receives no tip payout — completely excluded from all tip calculations',
};

interface EmployeeSetupDialogProps {
  employee?: Employee;
  onClose: () => void;
  onSave: (employee: Employee) => void;
}

export default function EmployeeSetupDialog({
  employee,
  onClose,
  onSave,
}: EmployeeSetupDialogProps) {
  const isNew = !employee;

  const [formData, setFormData] = useState<{
    name: string;
    role: string;
    payType: 'percentage' | 'hourly';
    hourlyRate: string;
    tipMode: TipMode;
  }>({
    name: employee?.name ?? '',
    role: employee?.role ?? '',
    hourlyRate: employee?.hourly_rate?.toString() ?? '',
    tipMode: employee?.tip_mode ?? 'pool',
    payType: employee?.pay_type ?? 'percentage',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNew && !formData.name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!formData.role) {
      toast.error('Please select a role');
      return;
    }
    if (!formData.hourlyRate || parseFloat(formData.hourlyRate) <= 0) {
      toast.error('Please enter a valid hourly rate');
      return;
    }

    setIsLoading(true);
    try {
      const saved = await saveEmployee({
        id: employee?.id,
        name: isNew ? formData.name.trim() : employee!.name,
        role: formData.role,
        hourly_rate: parseFloat(formData.hourlyRate),
        tip_mode: formData.tipMode,
        pay_type: formData.payType,
      });
      toast.success(isNew ? `${saved.name} added` : 'Changes saved');
      onSave(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save employee');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Employee' : 'Edit Employee'}</DialogTitle>
          {!isNew && (
            <DialogDescription>{employee!.name}</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {isNew && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full name"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => {
                let tipMode = formData.tipMode;
                if (value === 'barback' && (tipMode === 'pool' || tipMode === 'individual')) {
                  tipMode = 'barback';
                } else if ((value === 'manager' || value === 'security') && tipMode === 'pool') {
                  tipMode = 'individual';
                }
                setFormData({ ...formData, role: value as string, tipMode });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value as string}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
            <Input
              id="hourlyRate"
              type="number"
              step="0.01"
              min="0"
              value={formData.hourlyRate}
              onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
              placeholder="15.00"
            />
          </div>

          {formData.role === 'security' ? (
            <div className="flex gap-2 rounded-lg border border-dashed p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Security staff are excluded from tip distribution
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tipMode">Tip Distribution</Label>
              <Select
                value={formData.tipMode}
                onValueChange={(value) =>
                  setFormData({ ...formData, tipMode: value as TipMode })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formData.role !== 'manager' && (
                    <SelectItem value="pool">Pool (split by hours)</SelectItem>
                  )}
                  <SelectItem value="barback">Barback (15% of nightly pool)</SelectItem>
                  <SelectItem value="individual">Individual Tips</SelectItem>
                  <SelectItem value="sales_pct">Tips by Sales %</SelectItem>
                  <SelectItem value="no_tip">Not Tipped</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">{TIP_MODE_INFO[formData.tipMode]}</p>
              </div>

              {/* Only a barback can be on this arrangement, so asking everyone
                  would be a question with one right answer. Bartender pay is
                  governed by Tip Distribution above. */}
              {(formData.role === 'barback' || formData.tipMode === 'barback') && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="payType">Barback Pay</Label>
                  <Select
                    value={formData.payType}
                    onValueChange={(value) =>
                      setFormData({ ...formData, payType: value as 'percentage' | 'hourly' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Hourly wage + share of tips</SelectItem>
                      <SelectItem value="hourly">Hourly wage only</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {formData.payType === 'hourly'
                        ? 'Paid their hourly rate and nothing from the tip pool. Their share goes back to the bartenders rather than to the other barbacks.'
                        : 'Paid their hourly rate plus an equal share of the barback cut. This is the default.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving…' : isNew ? 'Add Employee' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
