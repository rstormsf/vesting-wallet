pragma solidity ^0.4.11;

import "./Ownable.sol";
import "./Token.sol";
import "./SafeMath.sol";

contract VestingWallet is Ownable, SafeMath {

    mapping(address => VestingSchedule) public schedules;        // vesting schedules for given addresses
    mapping(address => address) public addressChangeRequests;    // requested address changes

    Token vestingToken;
    uint public currentId = 0;

    event VestingScheduleRegistered(
        address indexed registeredAddress,
        uint id,
        uint startTimeInSec,
        uint cliffTimeInSec,
        uint endTimeInSec,
        uint totalAmount
    );
    event Withdrawal(address indexed registeredAddress, uint amountWithdrawn);
    event VestingEndedByOwner(address indexed registeredAddress, uint amountWithdrawn, uint amountRefunded);
    event AddressChangeRequested(address indexed oldRegisteredAddress, address indexed newRegisteredAddress);
    event AddressChangeConfirmed(address indexed oldRegisteredAddress, address indexed newRegisteredAddress);

    struct VestingSchedule {
        uint id;
        uint startTimeInSec;
        uint cliffTimeInSec;
        uint endTimeInSec;
        uint totalAmount;
        uint totalAmountWithdrawn;
    }

    modifier addressRegistered(address target) {
        VestingSchedule storage vestingSchedule = schedules[target];
        require(vestingSchedule.id != 0);
        _;
    }

    modifier addressNotRegistered(address target) {
        VestingSchedule storage vestingSchedule = schedules[target];
        require(vestingSchedule.id == 0);
        _;
    }

    modifier pendingAddressChangeRequest(address target) {
        require(addressChangeRequests[target] != address(0));
        _;
    }

    modifier pastCliffTime(address target) {
        VestingSchedule storage vestingSchedule = schedules[target];
        require(block.timestamp > vestingSchedule.cliffTimeInSec);
        _;
    }

    modifier validVestingScheduleTimes(uint startTimeInSec, uint cliffTimeInSec, uint endTimeInSec) {
        require(cliffTimeInSec >= startTimeInSec);
        require(endTimeInSec >= cliffTimeInSec);
        _;
    }

    modifier addressNotNull(address target) {
        require(target != address(0));
        _;
    }

    /// @dev Assigns a vesting token to the wallet.
    /// @param _vestingToken Token that will be vested.
    function VestingWallet(address _vestingToken) {
        vestingToken = Token(_vestingToken);
    }

    /// @dev Registers a vesting schedule to an address and deposits necessary tokens.
    /// @param _addressToRegister The address that is allowed to withdraw vested tokens for this schedule.
    /// @param _depositor Address that will be depositing vesting token.
    /// @param _startTimeInSec The time in seconds that vesting began.
    /// @param _cliffTimeInSec The time in seconds that tokens become withdrawable.
    /// @param _endTimeInSec The time in seconds that vesting ends.
    /// @param _totalAmount The total amount of tokens that the registered address can withdraw by the end of the vesting period.
    /// @return Success of registration.
    function registerVestingSchedule(
        address _addressToRegister,
        address _depositor,
        uint _startTimeInSec,
        uint _cliffTimeInSec,
        uint _endTimeInSec,
        uint _totalAmount
    )
        public
        onlyOwner
        addressNotRegistered(_addressToRegister)
        validVestingScheduleTimes(_startTimeInSec, _cliffTimeInSec, _endTimeInSec)
        returns (bool)
    {
        require(vestingToken.transferFrom(_depositor, address(this), _totalAmount));

        currentId = safeAdd(currentId, 1);
        schedules[_addressToRegister] = VestingSchedule({
            id: currentId,
            startTimeInSec: _startTimeInSec,
            cliffTimeInSec: _cliffTimeInSec,
            endTimeInSec: _endTimeInSec,
            totalAmount: _totalAmount,
            totalAmountWithdrawn: 0
        });

        VestingScheduleRegistered(
            _addressToRegister,
            currentId,
            _startTimeInSec,
            _cliffTimeInSec,
            _endTimeInSec,
            _totalAmount
        );
        return true;
    }

    /// @dev Allows a registered address to withdraw tokens that have already been vested.
    /// @return Success of withdrawal.
    function withdraw()
        public
        addressRegistered(msg.sender)
        pastCliffTime(msg.sender)
        returns (bool)
    {
        VestingSchedule storage vestingSchedule = schedules[msg.sender];

        uint totalAmountVested = getTotalAmountVested(vestingSchedule);
        uint amountWithdrawable = safeSub(totalAmountVested, vestingSchedule.totalAmountWithdrawn);
        vestingSchedule.totalAmountWithdrawn = totalAmountVested;
        require(vestingToken.transfer(msg.sender, amountWithdrawable));

        Withdrawal(msg.sender, amountWithdrawable);
        return true;
    }

    /// @dev Allows contract owner to terminate a vesting schedule, transfering remaining vested tokens to the registered address and refunding owner with remaining tokens.
    /// @param _addressToEnd Address that is currently registered to the vesting schedule that will be closed.
    /// @param _addressToRefund Address that will receive unvested tokens.
    /// @return Success of termination.
    function endVesting(address _addressToEnd, address _addressToRefund)
        public
        onlyOwner
        addressRegistered(_addressToEnd)
        addressNotNull(_addressToRefund)
        returns (bool)
    {
        VestingSchedule storage vestingSchedule = schedules[_addressToEnd];

        uint amountWithdrawable = 0;
        uint amountRefundable = 0;

        if (block.timestamp < vestingSchedule.cliffTimeInSec) {
            amountRefundable = vestingSchedule.totalAmount;
        } else {
            uint totalAmountVested = getTotalAmountVested(vestingSchedule);
            amountWithdrawable = safeSub(totalAmountVested, vestingSchedule.totalAmountWithdrawn);
            amountRefundable = safeSub(vestingSchedule.totalAmount, totalAmountVested);
        }

        delete schedules[_addressToEnd];
        require(amountWithdrawable == 0 || vestingToken.transfer(_addressToEnd, amountWithdrawable));
        require(amountRefundable == 0 || vestingToken.transfer(_addressToRefund, amountRefundable));

        VestingEndedByOwner(_addressToEnd, amountWithdrawable, amountRefundable);
        return true;
    }

    /// @dev Allows a registered address to request an address change.
    /// @param _newRegisteredAddress Desired address to update to.
    /// @return Success of request.
    function requestAddressChange(address _newRegisteredAddress)
        public
        addressRegistered(msg.sender)
        addressNotNull(_newRegisteredAddress)
        returns (bool)
    {
        addressChangeRequests[msg.sender] = _newRegisteredAddress;

        AddressChangeRequested(msg.sender, _newRegisteredAddress);
        return true;
    }

    /// @dev Confirm an address change and migrate vesting schedule to new address.
    /// @param _oldRegisteredAddress Current registered address.
    /// @param _newRegisteredAddress Address to migrate vesting schedule to.
    /// @return Success of address migration.
    function confirmAddressChange(address _oldRegisteredAddress, address _newRegisteredAddress)
        public
        onlyOwner
        pendingAddressChangeRequest(_oldRegisteredAddress)
        addressNotRegistered(_newRegisteredAddress)
        returns (bool)
    {
        address newRegisteredAddress = addressChangeRequests[_oldRegisteredAddress];
        require(newRegisteredAddress == _newRegisteredAddress);    // prevents race condition

        VestingSchedule memory vestingSchedule = schedules[_oldRegisteredAddress];
        schedules[newRegisteredAddress] = vestingSchedule;

        delete schedules[_oldRegisteredAddress];
        delete addressChangeRequests[_oldRegisteredAddress];

        AddressChangeConfirmed(_oldRegisteredAddress, _newRegisteredAddress);
        return true;
    }

    /// @dev Calculates the total tokens that have been vested for a vesting schedule, assuming the schedule is past the cliff.
    /// @param vestingSchedule Vesting schedule used to calcculate vested tokens.
    /// @return Total tokens vested for a vesting schedule.
    function getTotalAmountVested(VestingSchedule vestingSchedule)
        internal
        returns (uint)
    {
        if (block.timestamp >= vestingSchedule.endTimeInSec) return vestingSchedule.totalAmount;

        uint timeSinceStartInSec = safeSub(block.timestamp, vestingSchedule.startTimeInSec);
        uint totalVestingTimeInSec = safeSub(vestingSchedule.endTimeInSec, vestingSchedule.startTimeInSec);
        uint totalAmountVested = safeDiv(
            safeMul(timeSinceStartInSec, vestingSchedule.totalAmount),
            totalVestingTimeInSec
        );

        return totalAmountVested;
    }
}
