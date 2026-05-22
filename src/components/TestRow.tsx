import { useState } from 'react';
import { Play, Pencil, Trash2, Tag, Loader2, MoreVertical, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { RunResult, Test } from '@/lib/types';
import { RunResultBadge } from './RunResultBadge';

type Props = {
  test: Test;
  running: boolean;
  active: boolean;
  result?: RunResult;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function TestRow({ test, running, active, result, onRun, onEdit, onDelete }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyTag = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(test.tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore
    }
  };

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
        {active && running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-medium text-foreground">
          {test.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Tag className="h-3 w-3" />
          <span className="truncate text-primary/80">{test.tag}</span>
          <button
            type="button"
            onClick={handleCopyTag}
            aria-label="Copy tag"
            className={cn(
              'shrink-0 transition-opacity',
              copied
                ? 'opacity-100 text-green-500'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground',
            )}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <RunResultBadge result={result} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={running}
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-border hover:text-foreground disabled:opacity-40"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
