import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Test } from '@/lib/types';

type Props = {
  open: boolean;
  initial?: Test | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (t: Test) => void;
};

export function TestFormDialog({ open, initial, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setTag(initial?.tag ?? '');
    }
  }, [open, initial]);

  const submit = () => {
    if (!name.trim() || !tag.trim()) return;
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      tag: tag.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card font-mono">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {initial ? 'Edit test' : 'New test'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name" className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Login flow"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-tag" className="text-xs uppercase tracking-wider text-muted-foreground">Tag</Label>
            <Input
              id="t-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="auth.login"
              className="font-mono"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="hover:bg-border hover:text-foreground" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{initial ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
