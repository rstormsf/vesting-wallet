import * as assert from 'assert';
import * as BigNumber from 'bignumber.js';
import * as Web3 from 'web3';
import * as promisify from 'es6-promisify';
import {Artifacts} from '../util/artifacts';
import {testUtil} from '../util/test_util';
import {RPC} from '../util/rpc';
import {constants} from '../util/constants';

import {TokenMetadata, ContractInstance, ContractResponse} from '../util/types';

const {VestingWallet, DummyToken} = new Artifacts(artifacts);

const web3Instance: Web3 = web3;

contract('VestingWallet', (accounts: string[]) => {
    const owner = accounts[0];
    const registeredAddress = accounts[1];

    const vestingDurationInSec = 10000;
    const cliffTimeDivisor = 4;
    const rpc: RPC = new RPC();

    let vestingWallet: ContractInstance;
    let vestingToken: ContractInstance;

    const vestingTokenMetadata: TokenMetadata = {
        name: 'vestingToken',
        symbol: 'VT',
        decimals: new BigNumber(18),
        totalSupply: new BigNumber(1000000),
    };

    const getBlockTimestampAsync = async (): Promise<number> => {
        const blockNum = await promisify(web3Instance.eth.getBlockNumber)();
        const blockData = await promisify(web3Instance.eth.getBlock)(blockNum);
        const blockTimestamp: number = blockData.timestamp;

        return blockTimestamp;
    };

    const addressToRegister = registeredAddress;
    const depositor = owner;
    const totalAmount = vestingTokenMetadata.totalSupply;

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
        const startTimeInSec = new BigNumber(Math.floor(Date.now() / 1000));
        const cliffTimeInSec = startTimeInSec.plus(vestingDurationInSec / cliffTimeDivisor);
        const endTimeInSec = startTimeInSec.plus(vestingDurationInSec);

        it('should throw if not called by owner', async () => {
            const notOwner = registeredAddress;
            try {
                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            cliffTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
                                                            {from: notOwner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if cliffTimeInSec < startTimeInSec', async () => {
            const invalidCliffTimeInSec = startTimeInSec.minus(1);
            try {
                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            invalidCliffTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
                                                            {from: registeredAddress});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if endTimeInSec < cliffTimeInSec', async () => {
          const invalidEndTimeInSec = cliffTimeInSec.minus(1);
          try {
              await vestingWallet.registerVestingSchedule(addressToRegister,
                                                          depositor,
                                                          startTimeInSec,
                                                          cliffTimeInSec,
                                                          invalidEndTimeInSec,
                                                          totalAmount,
                                                          {from: registeredAddress});
              throw new Error('registerVestingSchedule succeeded when it should have failed');
          } catch (err) {
              testUtil.assertThrow(err);
          }
        });

        it('should register a vesting schedule to an address when called by owner', async () => {
            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});
            const scheduleArray = await vestingWallet.schedules.call(addressToRegister);
            const [
                registeredId,
                registeredStartTimeInSec,
                registeredCliffTimeInSec,
                registeredEndTimeInSec,
                registeredTotalAmount,
                registeredTotalAmountWithdrawn,
            ] = scheduleArray;

            const expectedIdString = '1';
            const expectedTotalAmountWithdrawnString = '0';
            assert.equal(registeredId.toString(), expectedIdString);
            assert.equal(registeredStartTimeInSec.toString(), startTimeInSec.toString());
            assert.equal(registeredCliffTimeInSec.toString(), cliffTimeInSec.toString());
            assert.equal(registeredEndTimeInSec.toString(), endTimeInSec.toString());
            assert.equal(registeredTotalAmount.toString(), totalAmount.toString());
            assert.equal(registeredTotalAmountWithdrawn.toString(), expectedTotalAmountWithdrawnString);
        });

        it('should register a vesting schedule and log the correct events when called by owner', async () => {
            const res: ContractResponse = await vestingWallet.registerVestingSchedule(addressToRegister,
                                                                                      depositor,
                                                                                      startTimeInSec,
                                                                                      cliffTimeInSec,
                                                                                      endTimeInSec,
                                                                                      totalAmount,
                                                                                      {from: owner});
            const logs = res.logs;
            assert.equal(logs.length, 1);
            const logArgs = logs[0].args;

            const expectedIdString = '1';
            assert.equal(logArgs.registeredAddress, addressToRegister);
            assert.equal(logArgs.id.toString(), expectedIdString);
            assert.equal(logArgs.startTimeInSec.toString(), startTimeInSec.toString());
            assert.equal(logArgs.cliffTimeInSec.toString(), cliffTimeInSec.toString());
            assert.equal(logArgs.endTimeInSec.toString(), endTimeInSec.toString());
            assert.equal(logArgs.totalAmount.toString(), totalAmount.toString());
        });

        it('should transfer totalAmount tokens from depositor to vestingWallet if called by owner', async () => {
            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});
            const ownerBalance = await vestingToken.balanceOf.call(depositor);
            const vestingWalletBalance = await vestingToken.balanceOf.call(vestingWallet.address);

            const expectedOwnerBalanceString = '0';
            assert.equal(ownerBalance.toString(), expectedOwnerBalanceString);
            assert.equal(vestingWalletBalance.toString(), totalAmount.toString());
        });

        it('should throw if owner has insufficient balance to deposit', async () => {
            const newBalance = new BigNumber(0);
            await vestingToken.setBalance(depositor, newBalance, {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            cliffTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
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
                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            cliffTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if address is already registered', async () => {
            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});

            try {
                await vestingWallet.registerVestingSchedule(addressToRegister,
                                                            depositor,
                                                            startTimeInSec,
                                                            cliffTimeInSec,
                                                            endTimeInSec,
                                                            totalAmount,
                                                            {from: owner});
                throw new Error('registerVestingSchedule succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });
    });

    describe('withdraw', () => {
        beforeEach(async () => {
            const blockTimestamp = await getBlockTimestampAsync();

            const startTimeInSec = new BigNumber(blockTimestamp);
            const cliffTimeInSec = startTimeInSec.plus(vestingDurationInSec / cliffTimeDivisor);
            const endTimeInSec = startTimeInSec.plus(vestingDurationInSec);

            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
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

            const expectedRegisteredAddressBalance = new BigNumber(totalAmount).times(percentageVested);
            const expectedVestingWalletBalance = new BigNumber(totalAmount).times(1 - percentageVested);

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
            const expectedAmountWithdrawn = new BigNumber(totalAmount).times(percentageVested);
            assert.equal(logArgs.registeredAddress, registeredAddress);
            assert.equal(logArgs.amountWithdrawn.toString(), expectedAmountWithdrawn.toString());
        });

        it('should withdraw the correct amount after a withdrawal has already been made', async () => {
            const initialPercentageVested = .5;
            let timeToIncreaseInSec = initialPercentageVested * vestingDurationInSec;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            await vestingWallet.withdraw({from: registeredAddress});

            const finalPercentageVested = .25;
            timeToIncreaseInSec = finalPercentageVested * vestingDurationInSec;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            await vestingWallet.withdraw({from: registeredAddress});
            const registeredAddressBalance = await vestingToken.balanceOf(registeredAddress);
            const vestingWalletBalance = await vestingToken.balanceOf(vestingWallet.address);

            const totalPercentageVested = initialPercentageVested + finalPercentageVested;
            const expectedRegisteredAddressBalance = new BigNumber(totalAmount).times(totalPercentageVested);
            const expectedVestingWalletBalance = new BigNumber(totalAmount).times(1 - totalPercentageVested);

            assert.equal(registeredAddressBalance.toString(), expectedRegisteredAddressBalance.toString());
            assert.equal(vestingWalletBalance.toString(), expectedVestingWalletBalance.toString());
        });

        it('should withdraw the correct amount when past end time of the vesting schedule', async () => {
            const percentageVested = 5;
            const timeToIncreaseInSec = percentageVested * vestingDurationInSec;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            await vestingWallet.withdraw({from: registeredAddress});
            const registeredAddressBalance = await vestingToken.balanceOf(registeredAddress);
            const vestingWalletBalance = await vestingToken.balanceOf(vestingWallet.address);

            const expectedRegisteredAddressBalance = new BigNumber(totalAmount);
            const expectedVestingWalletBalance = new BigNumber(0);

            assert.equal(registeredAddressBalance.toString(), expectedRegisteredAddressBalance.toString());
            assert.equal(vestingWalletBalance.toString(), expectedVestingWalletBalance.toString());
        });
    });

    describe('endVesting', () => {
        beforeEach(async () => {
            const blockTimestamp = await getBlockTimestampAsync();

            const startTimeInSec = new BigNumber(blockTimestamp);
            const cliffTimeInSec = startTimeInSec.plus(vestingDurationInSec / cliffTimeDivisor);
            const endTimeInSec = startTimeInSec.plus(vestingDurationInSec);

            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});
        });

        it('should throw if not called by owner', async () => {
          const addressToEnd = registeredAddress;
          const addressToRefund = owner;
          const notOwner = accounts[1];

          try {
              await vestingWallet.endVesting(addressToEnd, addressToRefund, {from: notOwner});
              throw new Error('endVesting succeeded when it should have failed');
          } catch (err) {
              testUtil.assertThrow(err);
          }
        });

        it('should throw if called on an unregistered address', async () => {
          const invalidOldRegisteredAddress = accounts[2];
          const addressToRefund = owner;

          try {
              await vestingWallet.endVesting(invalidOldRegisteredAddress, addressToRefund, {from: owner});
              throw new Error('endVesting succeeded when it should have failed');
          } catch (err) {
              testUtil.assertThrow(err);
          }
        });

        it('should throw if addressToRefund is a null address', async () => {
            const addressToEnd = registeredAddress;
            const addressToRefund = constants.NULL_ADDRESS;

            try {
                await vestingWallet.endVesting(addressToEnd, addressToRefund, {from: owner});
                throw new Error('endVesting succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should transfer the correct amounts if vesting is ended earlier than cliffTimeInSec', async () => {
            const addressToEnd = registeredAddress;
            const addressToRefund = owner;

            await vestingWallet.endVesting(addressToEnd, addressToRefund, {from: owner});
            const addressToEndBalance = await vestingToken.balanceOf(addressToEnd);
            const addressToRefundBalance = await vestingToken.balanceOf(addressToRefund);

            const expectedAddressToEndBalanceString = 0;
            assert.equal(addressToEndBalance.toString(), expectedAddressToEndBalanceString);
            assert.equal(addressToRefundBalance.toString(), totalAmount);
        });

        it('should transfer the correct amounts if vesting is ended past cliffTimeInSec', async () => {
            const addressToEnd = registeredAddress;
            const addressToRefund = owner;

            const timeToIncreaseInSec = vestingDurationInSec / cliffTimeDivisor;
            await rpc.increaseTimeAsync(timeToIncreaseInSec);

            await vestingWallet.endVesting(addressToEnd, addressToRefund, {from: owner});
            const addressToEndBalance = await vestingToken.balanceOf(addressToEnd);
            const addressToRefundBalance = await vestingToken.balanceOf(addressToRefund);

            const expectedAddressToEndBalance = totalAmount.div(cliffTimeDivisor);
            const expectedAddressToRefundBalance = totalAmount.minus(expectedAddressToEndBalance);

            assert.equal(addressToEndBalance.toString(), expectedAddressToEndBalance.toString());
            assert.equal(addressToRefundBalance.toString(), expectedAddressToRefundBalance.toString());
        });
    });

    describe('requestAddressChange', () => {
        const newRegisteredAddress = accounts[2];

        beforeEach(async () => {
            const startTimeInSec = new BigNumber(Math.floor(Date.now() / 1000));
            const cliffTimeInSec = startTimeInSec.plus(vestingDurationInSec / cliffTimeDivisor);
            const endTimeInSec = startTimeInSec.plus(vestingDurationInSec);

            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});
        });

        it('should throw if called from an unregistered address', async () => {
            const unregisteredAddress = owner;

            try {
                await vestingWallet.requestAddressChange(newRegisteredAddress, {from: unregisteredAddress});
                throw new Error('requestAddressChange succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if newRegisteredAddress is a null address', async () => {
            const invalidNewRegisteredAddress = constants.NULL_ADDRESS;

            try {
                await vestingWallet.requestAddressChange(invalidNewRegisteredAddress, {from: registeredAddress});
                throw new Error('requestAddressChange succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should request an address change if called from a registered address', async () => {
            await vestingWallet.requestAddressChange(newRegisteredAddress, {from: registeredAddress});
            const requestedAddress = await vestingWallet.addressChangeRequests.call(registeredAddress);
            assert.equal(requestedAddress, newRegisteredAddress);
        });

        it('should log the correct args if request is successful', async () => {
            const res: ContractResponse = await vestingWallet.requestAddressChange(newRegisteredAddress,
                                                                                   {from: registeredAddress});
            const logs = res.logs;
            assert.equal(res.logs.length, 1);

            const logArgs = logs[0].args;
            assert.equal(logArgs.oldRegisteredAddress, registeredAddress);
            assert.equal(logArgs.newRegisteredAddress, newRegisteredAddress);
        });
    });

    describe('confirmAddressChange', () => {
        const startTimeInSec = new BigNumber(Math.floor(Date.now() / 1000));
        const cliffTimeInSec = startTimeInSec.plus(vestingDurationInSec / cliffTimeDivisor);
        const endTimeInSec = startTimeInSec.plus(vestingDurationInSec);

        beforeEach(async () => {
            await vestingWallet.registerVestingSchedule(addressToRegister,
                                                        depositor,
                                                        startTimeInSec,
                                                        cliffTimeInSec,
                                                        endTimeInSec,
                                                        totalAmount,
                                                        {from: owner});
        });

        it('should throw if there is no pending request', async () => {
            const oldRegisteredAddress = registeredAddress;
            const newRegisteredAddress = accounts[2];

            try {
                await vestingWallet.confirmAddressChange(oldRegisteredAddress, newRegisteredAddress, {from: owner});
                throw new Error('confirmAddressChange succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if newRegisteredAddress is already registered', async () => {
            const oldRegisteredAddress = registeredAddress;
            const newRegisteredAddress = registeredAddress;

            await vestingWallet.requestAddressChange(newRegisteredAddress, {from: oldRegisteredAddress});

            try {
                await vestingWallet.confirmAddressChange(oldRegisteredAddress, newRegisteredAddress, {from: owner});
                throw new Error('confirmAddressChange succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should throw if newRegisteredAddress is different from the requested address', async () => {
            const oldRegisteredAddress = registeredAddress;
            const newRegisteredAddress = accounts[2];
            const invalidNewRegisteredAddress = owner;

            await vestingWallet.requestAddressChange(newRegisteredAddress, {from: oldRegisteredAddress});

            try {
                await vestingWallet.confirmAddressChange(oldRegisteredAddress,
                                                         invalidNewRegisteredAddress,
                                                         {from: owner});
                throw new Error('confirmAddressChange succeeded when it should have failed');
            } catch (err) {
                testUtil.assertThrow(err);
            }
        });

        it('should migrate the vesting schedule to a new address with valid args', async () => {
            const oldRegisteredAddress = registeredAddress;
            const newRegisteredAddress = accounts[2];

            await vestingWallet.requestAddressChange(newRegisteredAddress, {from: oldRegisteredAddress});
            await vestingWallet.confirmAddressChange(oldRegisteredAddress, newRegisteredAddress, {from: owner});

            const oldScheduleArray = await vestingWallet.schedules.call(oldRegisteredAddress);
            const [
                oldRegisteredId,
                oldRegisteredStartTimeInSec,
                oldRegisteredCliffTimeInSec,
                oldRegisteredEndTimeInSec,
                oldRegisteredTotalAmount,
                oldRegisteredTotalAmountWithdrawn,
            ] = oldScheduleArray;

            const nullUintString = 0;
            assert.equal(oldRegisteredId.toString(), nullUintString);
            assert.equal(oldRegisteredStartTimeInSec.toString(), nullUintString);
            assert.equal(oldRegisteredCliffTimeInSec.toString(), nullUintString);
            assert.equal(oldRegisteredEndTimeInSec.toString(), nullUintString);
            assert.equal(oldRegisteredTotalAmount.toString(), nullUintString);
            assert.equal(oldRegisteredTotalAmountWithdrawn.toString(), nullUintString);

            const newScheduleArray = await vestingWallet.schedules.call(newRegisteredAddress);
            const [
                newRegisteredId,
                newRegisteredStartTimeInSec,
                newRegisteredCliffTimeInSec,
                newRegisteredEndTimeInSec,
                newRegisteredTotalAmount,
                newRegisteredTotalAmountWithdrawn,
            ] = newScheduleArray;

            const expectedIdString = '1';
            const expectedTotalAmountWithdrawnString = '0';
            assert.equal(newRegisteredId.toString(), expectedIdString);
            assert.equal(newRegisteredStartTimeInSec.toString(), startTimeInSec.toString());
            assert.equal(newRegisteredCliffTimeInSec.toString(), cliffTimeInSec.toString());
            assert.equal(newRegisteredEndTimeInSec.toString(), endTimeInSec.toString());
            assert.equal(newRegisteredTotalAmount.toString(), totalAmount.toString());
            assert.equal(newRegisteredTotalAmountWithdrawn.toString(), expectedTotalAmountWithdrawnString);

            const requestedAddress = await vestingWallet.addressChangeRequests.call(oldRegisteredAddress);
            assert.equal(requestedAddress, constants.NULL_ADDRESS);
        });

        it('should log the correct args on a successful confirmation', async () => {
            const oldRegisteredAddress = registeredAddress;
            const newRegisteredAddress = accounts[2];

            await vestingWallet.requestAddressChange(newRegisteredAddress, {from: oldRegisteredAddress});
            const res: ContractResponse = await vestingWallet.confirmAddressChange(oldRegisteredAddress,
                                                                                   newRegisteredAddress,
                                                                                   {from: owner});
            const logs = res.logs;
            assert.equal(logs.length, 1);

            const logArgs = logs[0].args;
            assert.equal(logArgs.oldRegisteredAddress, oldRegisteredAddress);
            assert.equal(logArgs.newRegisteredAddress, newRegisteredAddress);
        });
    });
});
