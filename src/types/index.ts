export interface YamlConfig {
  [key: string]: unknown;
}

export interface BuildVariant {
  description: string;
  filename: string;
  include: {
    main_config?: boolean;
    palette?: boolean;
    transient?: boolean;
    left_prompt?: boolean;
    right_prompt?: boolean;
    tooltips?: boolean;
  };
  exclude?: {
    segments?: string[];
  };
}

export interface BuildConfig {
  variants: Record<string, BuildVariant>;
  default_variant: string;
  fallback_variant: string;
}

export interface ConfigStats {
  totalKeys: number;
  hasTooltips: number;
  hasBlocks: number;
  hasPalette: number;
  totalSegments: number;
}

export interface TaskContext {
  yamlFiles: string[];
  configs: YamlConfig[];
  fullConfig: YamlConfig;
  buildConfig?: BuildConfig | undefined;
  variantsToBuild: string[];
  statistics: {
    filesFound: number;
    filesParsed: number;
    variantsBuilt: number;
    totalSegments: number;
    totalTooltips: number;
  };
}

export interface BuildResult {
  success: boolean;
  variantsBuilt: number;
  totalSegments: number;
  totalTooltips: number;
  errors?: string[];
}
