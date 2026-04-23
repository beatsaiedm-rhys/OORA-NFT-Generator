export type NftTrait = { trait_type: string; value: string | number };
export type ProductDropInput = {
  brand: string;
  productName: string;
  chain: 'ethereum' | 'bsc' | 'solana';
  edition: number;
  maxSupply: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  imageUri: string;
  claimUtility?: string;
};

export type NftMetadata = {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: NftTrait[];
};

export function createProductNftMetadata(input: ProductDropInput): NftMetadata {
  return {
    name: `${input.brand} ${input.productName} #${input.edition}`,
    description: `${input.productName} is an OORA product-backed digital collectible. Holding this NFT can unlock the configured product claim and brand membership utility.`,
    image: input.imageUri,
    attributes: [
      { trait_type: 'Brand', value: input.brand },
      { trait_type: 'Product', value: input.productName },
      { trait_type: 'Chain', value: input.chain },
      { trait_type: 'Edition', value: input.edition },
      { trait_type: 'Max Supply', value: input.maxSupply },
      { trait_type: 'Rarity', value: input.rarity },
      { trait_type: 'Claim Utility', value: input.claimUtility || 'Physical product redemption' },
    ],
  };
}

export function buildMetadataBatch(input: Omit<ProductDropInput, 'edition'>): NftMetadata[] {
  return Array.from({ length: input.maxSupply }, (_, index) => createProductNftMetadata({ ...input, edition: index + 1 }));
}
