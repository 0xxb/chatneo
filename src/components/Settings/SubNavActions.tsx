import { Plus, Trash2 } from 'lucide-react';

interface SubNavActionsProps {
  onAdd?: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

export default function SubNavActions({ onAdd, onDelete, deleteDisabled }: SubNavActionsProps) {
  return (
    <div className="flex items-center gap-1 p-1.5">
      {onAdd && (
        <button
          onClick={onAdd}
          className="w-7 h-7 flex items-center justify-center rounded-md text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label) transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          disabled={deleteDisabled}
          className="w-7 h-7 flex items-center justify-center rounded-md text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-red-500 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
