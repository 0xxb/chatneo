import { SquarePen } from 'lucide-react';
import { iconButtonClass } from './styles';

interface NewChatButtonProps {
  onClick?: () => void;
}

export default function NewChatButton({ onClick }: NewChatButtonProps) {
  return (
    <button onClick={onClick} className={iconButtonClass}>
      <SquarePen className="w-4 h-4" />
    </button>
  );
}
