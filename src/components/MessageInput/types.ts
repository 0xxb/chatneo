export interface Attachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  path: string;
  /** base64 data URL for image preview */
  preview?: string;
}

export interface MessagePayload {
  text: string;
  attachments: Attachment[];
}

export interface MessageInputProps {
  onSend?: (message: MessagePayload) => void;
  disabled?: boolean;
  placeholder?: string;
  onStop?: () => void;
  onEditMessage?: (messageId: string, newText: string, attachments: Attachment[]) => void;
  onClearMessages?: () => void;
  /** When true, removes outer padding for inline use (e.g. inline editing) */
  inline?: boolean;
}
