export interface ModelCaps {
  thinking?: boolean;
  vision?: boolean;
  imageOutput?: boolean;
  videoOutput?: boolean;
  functionCalling?: boolean;
  webSearch?: boolean;
}

export interface Model {
  modelId: string;
  name: string;
  providerId: number;
  providerName: string;
  providerIcon: string;
  favorited?: boolean;
  caps: ModelCaps;
}

export type TabType = 'all' | 'favorites';
