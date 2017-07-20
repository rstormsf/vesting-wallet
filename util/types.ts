import * as BigNumber from 'bignumber.js';

export interface TokenMetadata {
    name: string;
    symbol: string;
    decimals: BigNumber.BigNumber;
    totalSupply: BigNumber.BigNumber;
}

export type ContractInstance = any;
