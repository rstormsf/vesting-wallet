import * as assert from 'assert';
import * as BigNumber from 'bignumber.js';
import {Artifacts} from '../util/artifacts';
import {testUtil} from '../util/test_util';
import {TokenMetadata, ContractInstance, ContractResponse} from '../util/types';

const {VestingWallet, DummyToken} = new Artifacts(artifacts);

contract('VestingWallet', (accounts: string[]) => {
    const owner = accounts[0];
    const registeredAddress = accounts[1];

    const vestingDurationInSec = 10000;

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
        const _addressToRegister = registeredAddress;
        const _depositor = owner;
        const _startTimeInSec = new BigNumber(Math.floor(Date.now() / 1000));
        const _endTimeInSec = _startTimeInSec.plus(vestingDurationInSec);
        const _totalAmount = vestingTokenMetadata.totalSupply;

        it('should throw if not called by owner', async () => {
            try {
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: registeredAddress});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should register a vesting schedule to an address when called by owner', async () => {
            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});
            const scheduleArray = await vestingWallet.schedules.call(_addressToRegister);
            const [id, startTimeInSec, endTimeInSec, totalAmount, totalAmountWithdrawn] = scheduleArray;

            const idString = '1';
            const totalAmountWithdrawnString = '0';
            assert.equal(id.toString(), idString);
            assert.equal(startTimeInSec.toString(), _startTimeInSec.toString());
            assert.equal(endTimeInSec.toString(), _endTimeInSec.toString());
            assert.equal(totalAmount.toString(), _totalAmount.toString());
            assert.equal(totalAmountWithdrawn.toString(), totalAmountWithdrawnString);
        });

        it('should register a vesting schedule and log the correct events when called by owner', async () => {
            const res: ContractResponse = await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                                                      _depositor,
                                                                                      _startTimeInSec,
                                                                                      _endTimeInSec,
                                                                                      _totalAmount,
                                                                                      {from: owner});
            const logs = res.logs;
            assert.equal(logs.length, 1);
            const logArgs = logs[0].args;

            const idString = '1';
            const totalAmountWithdrawnString = '0';
            assert.equal(logArgs.registeredAddress, _addressToRegister);
            assert.equal(logArgs.id, idString);
            assert.equal(logArgs.startTimeInSec.toString(), _startTimeInSec.toString());
            assert.equal(logArgs.endTimeInSec.toString(), _endTimeInSec.toString());
            assert.equal(logArgs.totalAmount.toString(), _totalAmount.toString());
        });

        it('should transfer totalAmount tokens from depositor to vestingWallet if called by owner', async () => {
            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});
            const ownerBalance = await vestingToken.balanceOf.call(_depositor);
            const vestingWalletBalance = await vestingToken.balanceOf.call(vestingWallet.address);

            const expectedOwnerBalanceString = '0';
            assert.equal(ownerBalance.toString(), expectedOwnerBalanceString);
            assert.equal(vestingWalletBalance.toString(), _totalAmount.toString());
        });

        it('should throw if owner has insufficient balance to deposit', async () => {
            const newBalance = new BigNumber(0);
            await vestingToken.setBalance(_depositor, newBalance, {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if owner has insufficient allowances to deposit', async () => {
            const newAllowance = new BigNumber(0);
            await vestingToken.approve(vestingWallet.address, newAllowance, {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if address is already registered', async () => {
            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });
    });
});
