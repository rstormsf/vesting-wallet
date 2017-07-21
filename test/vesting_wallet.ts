import * as assert from 'assert';
import * as BigNumber from 'bignumber.js';
import * as Web3 from 'web3';
import * as promisify from 'es6-promisify';
import {Artifacts} from '../util/artifacts';
import {testUtil} from '../util/test_util';
import {RPC} from '../util/rpc';
import {TokenMetadata, ContractInstance, ContractResponse} from '../util/types';

const {VestingWallet, DummyToken} = new Artifacts(artifacts);

const web3Instance: Web3 = web3;

contract('VestingWallet', (accounts: string[]) => {
    const owner = accounts[0];
    const registeredAddress = accounts[1];

    const vestingDurationInSec = 10000;
    const rpc: RPC = new RPC();

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
        const _cliffTimeInSec = _startTimeInSec.plus(vestingDurationInSec / 4);
        const _endTimeInSec = _startTimeInSec.plus(vestingDurationInSec);
        const _totalAmount = vestingTokenMetadata.totalSupply;

        it('should throw if not called by owner', async () => {
            try {
                const notOwner = registeredAddress;
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _cliffTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: notOwner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should register a vesting schedule to an address when called by owner', async () => {
            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _cliffTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});
            const scheduleArray = await vestingWallet.schedules.call(_addressToRegister);
            const [id, startTimeInSec, cliffTimeInSec, endTimeInSec, totalAmount, totalAmountWithdrawn] = scheduleArray;

            const idString = '1';
            const totalAmountWithdrawnString = '0';
            assert.equal(id.toString(), idString);
            assert.equal(startTimeInSec.toString(), _startTimeInSec.toString());
            assert.equal(cliffTimeInSec.toString(), _cliffTimeInSec.toString());
            assert.equal(endTimeInSec.toString(), _endTimeInSec.toString());
            assert.equal(totalAmount.toString(), _totalAmount.toString());
            assert.equal(totalAmountWithdrawn.toString(), totalAmountWithdrawnString);
        });

        it('should register a vesting schedule and log the correct events when called by owner', async () => {
            const res: ContractResponse = await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                                                      _depositor,
                                                                                      _startTimeInSec,
                                                                                      _cliffTimeInSec,
                                                                                      _endTimeInSec,
                                                                                      _totalAmount,
                                                                                      {from: owner});
            const logs = res.logs;
            assert.equal(logs.length, 1);
            const logArgs = logs[0].args;

            const idString = '1';
            assert.equal(logArgs.registeredAddress, _addressToRegister);
            assert.equal(logArgs.id.toString(), idString);
            assert.equal(logArgs.startTimeInSec.toString(), _startTimeInSec.toString());
            assert.equal(logArgs.cliffTimeInSec.toString(), _cliffTimeInSec.toString());
            assert.equal(logArgs.endTimeInSec.toString(), _endTimeInSec.toString());
            assert.equal(logArgs.totalAmount.toString(), _totalAmount.toString());
        });

        it('should transfer totalAmount tokens from depositor to vestingWallet if called by owner', async () => {
            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _cliffTimeInSec,
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
                                                            _cliffTimeInSec,
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
                                                            _cliffTimeInSec,
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
                                                        _cliffTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                            _depositor,
                                                            _startTimeInSec,
                                                            _cliffTimeInSec,
                                                            _endTimeInSec,
                                                            _totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });
    });

    describe('withdraw', () => {
        const _addressToRegister = registeredAddress;
        const _depositor = owner;
        const _totalAmount = vestingTokenMetadata.totalSupply;

        beforeEach(async () => {
            const blockNum = await promisify(web3Instance.eth.getBlockNumber)();
            const blockData = await promisify(web3Instance.eth.getBlock)(blockNum);
            const blockTimestamp: number = blockData.timestamp;

            const _startTimeInSec = new BigNumber(blockTimestamp);
            const _cliffTimeInSec = _startTimeInSec.plus(vestingDurationInSec / 4);
            const _endTimeInSec = _startTimeInSec.plus(vestingDurationInSec);

            await vestingWallet.registerVestingSchedule(_addressToRegister,
                                                        _depositor,
                                                        _startTimeInSec,
                                                        _cliffTimeInSec,
                                                        _endTimeInSec,
                                                        _totalAmount,
                                                        {from: owner});
        });

        it('throw if called from an unregistered address', async () => {
            try {
                const unregisteredAddress = owner;
                await vestingWallet.withdraw({from: unregisteredAddress});
                throw new Error('withdraw succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if a registered address attempts to withdraw before the cliff time', async () => {
            try {
                await vestingWallet.withdraw({from: registeredAddress});
                throw new Error('withdraw succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should allow a registered address to withdraw vested tokens after the cliff', async () => {
            const percentageVested = .5;
            const timeToIncreaseInSec = percentageVested * vestingDurationInSec;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            await vestingWallet.withdraw({from: registeredAddress});
            const registeredAddressBalance = await vestingToken.balanceOf(registeredAddress);
            const vestingWalletBalance = await vestingToken.balanceOf(vestingWallet.address);

            const expectedRegisteredAddressBalance = new BigNumber(_totalAmount).times(percentageVested);
            const expectedVestingWalletBalance = new BigNumber(_totalAmount).times(1 - percentageVested);

            assert.equal(registeredAddressBalance.toString(), expectedRegisteredAddressBalance.toString());
            assert.equal(vestingWalletBalance.toString(), expectedVestingWalletBalance.toString());
        });

        it('should log the correct arguments after a successful withdrawal', async () => {
            const percentageVested = .5;
            const timeToIncreaseInSec = percentageVested * vestingDurationInSec;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            const res: ContractResponse = await vestingWallet.withdraw({from: registeredAddress});
            const logs = res.logs;
            assert.equal(logs.length, 1);

            const logArgs = logs[0].args;
            const expectedAmountWithdrawn = new BigNumber(_totalAmount).times(percentageVested);
            assert.equal(logArgs.registeredAddress, registeredAddress);
            assert.equal(logArgs.amountWithdrawn.toString(), expectedAmountWithdrawn.toString());
        });
    });
});
