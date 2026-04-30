import { Play, Pencil, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Test } from '@/lib/types';

type Props = {
  test: Test;
  running: boolean;
  active: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function TestRow({ test, running, active, onRun, onEdit, onDelete }: Props) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-all',
        'hover:border-primary/50 hover:bg-secondary',
        active && 'border-primary/70 shadow-glow',
      )}
    >
      <Button
        size="sm"
        onClick={onRun}
        disabled={running}
        className="h-8 shrink-0 bg-primary px-3 font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
      </Button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-medium text-foreground">
          {test.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Tag className="h-3 w-3" />
          <span className="truncate text-primary/80">{test.tag}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-border hover:text-foreground" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-border hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
