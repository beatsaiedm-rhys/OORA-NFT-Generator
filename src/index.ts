export type SupportedChain = 'ethereum' | 'bsc' | 'solana';
export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type NftTrait = { trait_type: string; value: string | number; display_type?: string };

export type WeightedTraitOption = {
  value: string;
  weight: number;
  rarity?: RarityTier;
};

export type TraitLayer = {
  traitType: string;
  options: WeightedTraitOption[];
};

export type ProductDropInput = {
  brand: string;
  productName: string;
  chain: SupportedChain;
  maxSupply: number;
  imageBaseUri: string;
  externalUrl?: string;
  claimUtility?: string;
  royaltyBps?: number;
  traitLayers: TraitLayer[];
};

export type NftMetadata = {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  seller_fee_basis_points?: number;
  attributes: NftTrait[];
  properties: {
    category: 'image';
    files: Array<{ uri: string; type: string }>;
  };
};

export type CollectionManifest = {
  brand: string;
  productName: string;
  chain: SupportedChain;
  maxSupply: number;
  royaltyBps: number;
  generatedAt: string;
  raritySummary: Record<RarityTier, number>;
  metadata: NftMetadata[];
};

const rarityRank: Record<RarityTier, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function selectWeighted(options: WeightedTraitOption[], random: () => number): WeightedTraitOption {
  const total = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
  if (total <= 0) throw new Error('Trait layer must include at least one weighted option.');
  let cursor = random() * total;
  for (const option of options) {
    cursor -= Math.max(0, option.weight);
    if (cursor <= 0) return option;
  }
  return options[options.length - 1];
}

function inferRarity(attributes: NftTrait[], layers: TraitLayer[]): RarityTier {
  let score = 0;
  attributes.forEach((attribute) => {
    const layer = layers.find((item) => item.traitType === attribute.trait_type);
    const option = layer?.options.find((item) => item.value === attribute.value);
    score += rarityRank[option?.rarity || 'common'];
  });
  const average = score / Math.max(attributes.length, 1);
  if (average >= 4.6) return 'legendary';
  if (average >= 3.8) return 'epic';
  if (average >= 3) return 'rare';
  if (average >= 2) return 'uncommon';
  return 'common';
}

export function validateDropInput(input: ProductDropInput): void {
  if (!input.brand.trim()) throw new Error('Brand is required.');
  if (!input.productName.trim()) throw new Error('Product name is required.');
  if (!Number.isInteger(input.maxSupply) || input.maxSupply < 1) throw new Error('Max supply must be a positive integer.');
  if (!input.traitLayers.length) throw new Error('At least one trait layer is required.');
  input.traitLayers.forEach((layer) => {
    if (!layer.traitType.trim()) throw new Error('Each trait layer needs a traitType.');
    if (!layer.options.length) throw new Error(`Trait layer ${layer.traitType} has no options.`);
  });
}

export function createProductNftMetadata(input: ProductDropInput, edition: number): NftMetadata {
  validateDropInput(input);
  if (edition < 1 || edition > input.maxSupply) throw new Error('Edition is outside max supply.');
  const random = seededRandom(`${input.brand}:${input.productName}:${edition}`);
  const selected = input.traitLayers.map((layer) => {
    const option = selectWeighted(layer.options, random);
    return { trait_type: layer.traitType, value: option.value };
  });
  const rarity = inferRarity(selected, input.traitLayers);
  const image = `${input.imageBaseUri.replace(/\/$/, '')}/${edition}.png`;
  const attributes: NftTrait[] = [
    { trait_type: 'Brand', value: input.brand },
    { trait_type: 'Product', value: input.productName },
    { trait_type: 'Chain', value: input.chain },
    { trait_type: 'Edition', value: edition },
    { trait_type: 'Max Supply', value: input.maxSupply },
    { trait_type: 'Rarity', value: rarity },
    { trait_type: 'Claim Utility', value: input.claimUtility || 'Physical product redemption' },
    ...selected,
  ];

  return {
    name: `${input.brand} ${input.productName} #${edition}`,
    description: `${input.productName} is an OORA product-backed digital collectible. Holding this NFT can unlock the configured product claim and brand membership utility.`,
    image,
    external_url: input.externalUrl,
    seller_fee_basis_points: input.royaltyBps ?? 500,
    attributes,
    properties: {
      category: 'image',
      files: [{ uri: image, type: 'image/png' }],
    },
  };
}

export function buildMetadataBatch(input: ProductDropInput): NftMetadata[] {
  return Array.from({ length: input.maxSupply }, (_, index) => createProductNftMetadata(input, index + 1));
}

export function buildCollectionManifest(input: ProductDropInput): CollectionManifest {
  const metadata = buildMetadataBatch(input);
  const raritySummary = metadata.reduce(
    (summary, item) => {
      const rarity = item.attributes.find((attribute) => attribute.trait_type === 'Rarity')?.value as RarityTier;
      summary[rarity] += 1;
      return summary;
    },
    { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 } as Record<RarityTier, number>,
  );

  return {
    brand: input.brand,
    productName: input.productName,
    chain: input.chain,
    maxSupply: input.maxSupply,
    royaltyBps: input.royaltyBps ?? 500,
    generatedAt: new Date().toISOString(),
    raritySummary,
    metadata,
  };
}

export function detectDuplicateAttributeSets(metadata: NftMetadata[]): Array<{ name: string; duplicateOf: string }> {
  const seen = new Map<string, string>();
  const duplicates: Array<{ name: string; duplicateOf: string }> = [];
  metadata.forEach((item) => {
    const key = item.attributes
      .filter((attribute) => !['Edition', 'Max Supply'].includes(attribute.trait_type))
      .map((attribute) => `${attribute.trait_type}:${attribute.value}`)
      .sort()
      .join('|');
    const previous = seen.get(key);
    if (previous) duplicates.push({ name: item.name, duplicateOf: previous });
    else seen.set(key, item.name);
  });
  return duplicates;
}
