import * as BigNumber from 'bignumber.js';
import {Artifacts} from '../util/artifacts';
import {testUtil} from '../util/test_util';
import {TokenMetadata, ContractInstance} from '../util/types';

const {VestingWallet, DummyToken} = new Artifacts(artifacts);

contract('VestingWallet', (accounts: string[]) => {
    const owner: string = accounts[0];
    const registeredAddress: string = accounts[1];

    const vestingDurationInSec: number = 10000;

    let vestingWallet: ContractInstance;
    let vestingToken: ContractInstance;

    const vestingTokenMetadata: TokenMetadata = {
        name: 'vestingToken',
        symbol: 'VT',
        decimals: new BigNumber(18),
        totalSupply: new BigNumber(1000000),
    };

    beforeEach(async () => {
        vestingToken = await DummyToken.new(vestingTokenMetadata.name,
                                            vestingTokenMetadata.symbol,
                                            vestingTokenMetadata.decimals,
                                            vestingTokenMetadata.totalSupply,
                                            {from: owner});
        vestingWallet = await VestingWallet.new(vestingToken.address, {from: owner});
        await vestingToken.approve(vestingWallet.address, vestingTokenMetadata.totalSupply);
    });

    describe('registerVestingSchedule', () => {
        it('should throw if not called by owner', async () => {
            try {
                const addressToRegister: string = registeredAddress;
                const depositor: string = owner;
                const startTimeInSec: BigNumber.BigNumber = new BigNumber(Math.floor(Date.now() / 1000));
                const endTimeInSec: BigNumber.BigNumber = startTimeInSec.plus(vestingDurationInSec);
                const totalAmount: BigNumber.BigNumber = vestingTokenMetadata.totalSupply;

                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
                                                            {from: registeredAddress});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });
    });
});
