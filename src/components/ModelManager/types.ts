import type { ModelCapabilities } from '../../lib/model-capabilities';
import type { ImageGenerationSettings } from '../../lib/providers/types';

export type { ModelCapabilities };
export type { ImageGenerationSettings };

export interface Model {
  id: string;
  name: string;
  modelId: string;
  contextLength?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapabilities;
  imageSettings?: ImageGenerationSettings;
}

export interface ModelManagerProps {
  title?: string;
  value: Model[];
  onChange: (models: Model[]) => void;
  onFetchModels?: () => void;
  isFetchingModels?: boolean;
}
