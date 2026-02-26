// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20Upgradeable}           from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {AccessControlUpgradeable}   from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable}            from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}              from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Events}                     from "./libraries/Events.sol";
import {Validation}                 from "./libraries/Validation.sol";

/// @title ppDOT
/// @notice Rebasing ERC-20 receipt token for PolkaPulse depositors.
///
/// @dev    REBASING MODEL:
///         ppDOT does not store fixed balances. Instead it stores each holder's
///         *shares* of the total DOT pool. As yield accrues, the exchange rate
///         (totalDotManaged / totalShares) increases, so every holder's effective
///         DOT balance grows without any transfer event being emitted.
///
///         balanceOf(user) = shares[user] × exchangeRate / PRECISION
///
///         This is mathematically equivalent to stETH's share model. The rebasing
///         is passive — no keeper is needed to update individual balances.
///
///         MINTING / BURNING:
///         Only MINTER_ROLE (held by PolkaPulseCore) can mint or burn shares.
///         This prevents any external party from diluting the pool.
///
///         UPGRADEABILITY:
///         Upgradeable via UUPS. The UPGRADER_ROLE is held by the Timelock.
///         A storage gap of 50 slots is reserved for future state additions.
///
///         COMPATIBILITY NOTE:
///         Because balanceOf() is dynamic, integrations that snapshot ERC-20
///         balances at a fixed block (some governance systems, lending protocols)
///         will see different values than the snapshot. Integrators should
///         use sharesOf() for stable accounting and convert at query time.
contract ppDOT is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using Validation for *;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 private constant PRECISION = 1e18;

    /// @notice Initial exchange rate: 1 ppDOT = 1 DOT.
    ///         Stored as PRECISION (1e18) to preserve 18 decimal precision.
    uint256 private constant INITIAL_EXCHANGE_RATE = PRECISION;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Internal share balances. NOT the same as ERC-20 balances.
    ///         Use sharesOf() to read raw shares; balanceOf() returns DOT equivalent.
    mapping(address => uint256) private _shares;

    /// @notice Total shares in existence.
    uint256 public totalShares;

    /// @notice Total DOT under management (principal + all accrued yield).
    ///         Updated by notifyYield() called by PolkaPulseCore after each harvest.
    uint256 public totalDotManaged;

    // -------------------------------------------------------------------------
    // Storage gap — reserve 50 slots for future upgrades
    // -------------------------------------------------------------------------

    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Initializer (replaces constructor for upgradeable contracts)
    // -------------------------------------------------------------------------

    /// @notice Initializes the ppDOT token. Called once atomically with proxy deployment.
    /// @param admin     Address granted DEFAULT_ADMIN_ROLE and MINTER_ROLE initially.
    ///                  Should be PolkaPulseCore (or its proxy address).
    /// @param upgrader  Address granted UPGRADER_ROLE. Should be the Timelock.
    function initialize(address admin, address upgrader) external initializer {
        Validation.requireNonZeroAddress(admin);
        Validation.requireNonZeroAddress(upgrader);

        __ERC20_init("PolkaPulse DOT", "ppDOT");
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);

        totalDotManaged = 0;
        totalShares     = 0;
    }

    // -------------------------------------------------------------------------
    // ERC-20 overrides — convert shares to DOT equivalents
    // -------------------------------------------------------------------------

    /// @notice Returns the DOT-equivalent balance of an account.
    ///         Computed dynamically as shares × exchangeRate / PRECISION.
    ///         Returns 0 if no DOT is under management yet.
    function balanceOf(address account)
        public
        view
        override
        returns (uint256)
    {
        if (totalShares == 0) return 0;
        return _shares[account] * exchangeRate() / PRECISION;
    }

    /// @notice Returns the total DOT-equivalent supply of ppDOT.
    ///         Equals totalDotManaged.
    function totalSupply() public view override returns (uint256) {
        return totalDotManaged;
    }

    // -------------------------------------------------------------------------
    // Rebasing — share-level operations
    // -------------------------------------------------------------------------

    /// @notice Returns the raw share balance of an account (not DOT-equivalent).
    function sharesOf(address account) external view returns (uint256) {
        return _shares[account];
    }

    /// @notice Returns the current ppDOT/DOT exchange rate (18-decimal).
    ///         Rate = totalDotManaged / totalShares.
    ///         Returns INITIAL_EXCHANGE_RATE if no shares exist yet.
    function exchangeRate() public view returns (uint256) {
        if (totalShares == 0) return INITIAL_EXCHANGE_RATE;
        return totalDotManaged * PRECISION / totalShares;
    }

    /// @notice Converts a DOT amount to ppDOT shares at the current exchange rate.
    /// @param dotAmount DOT amount (18-decimal).
    /// @return shares   Corresponding ppDOT share count.
    function dotToShares(uint256 dotAmount) public view returns (uint256) {
        uint256 rate = exchangeRate();
        Validation.requireNonZeroExchangeRate(rate);
        return dotAmount * PRECISION / rate;
    }

    /// @notice Converts a ppDOT share count to DOT at the current exchange rate.
    /// @param shares  ppDOT shares.
    /// @return dot    Corresponding DOT amount (18-decimal).
    function sharesToDot(uint256 shares) public view returns (uint256) {
        return shares * exchangeRate() / PRECISION;
    }

    // -------------------------------------------------------------------------
    // Mint / Burn (MINTER_ROLE only)
    // -------------------------------------------------------------------------

    /// @notice Mint ppDOT shares to a depositor.
    ///         Called by PolkaPulseCore on each deposit.
    ///
    /// @dev    Share count is calculated BEFORE totalDotManaged is increased,
    ///         ensuring the depositor gets the correct pre-deposit exchange rate.
    ///         PolkaPulseCore must increment totalDotManaged via notifyYield
    ///         or the deposit accounting path, not this function.
    ///
    /// @param to      Recipient address.
    /// @param shares  Number of shares to mint.
    function mintShares(address to, uint256 shares)
        external
        onlyRole(MINTER_ROLE)
    {
        Validation.requireNonZeroAddress(to);
        Validation.requireNonZeroAmount(shares);

        _shares[to]  += shares;
        totalShares  += shares;

        // Emit standard ERC-20 Transfer for wallet/indexer compatibility
        emit Transfer(address(0), to, sharesToDot(shares));
    }

    /// @notice Burn ppDOT shares from a redeemer.
    ///         Called by PolkaPulseCore on each withdrawal.
    ///
    /// @param from    Address to burn shares from.
    /// @param shares  Number of shares to burn.
    function burnShares(address from, uint256 shares)
        external
        onlyRole(MINTER_ROLE)
    {
        Validation.requireNonZeroAddress(from);
        Validation.requireNonZeroAmount(shares);
        Validation.requireSufficientShares(shares, _shares[from]);

        uint256 dotEquivalent = sharesToDot(shares);

        _shares[from]  -= shares;
        totalShares    -= shares;

        // Emit standard ERC-20 Transfer for wallet/indexer compatibility
        emit Transfer(from, address(0), dotEquivalent);
    }

    // -------------------------------------------------------------------------
    // Yield notification
    // -------------------------------------------------------------------------

    /// @notice Update totalDotManaged to reflect new yield, increasing the
    ///         exchange rate for all existing holders.
    ///         Called by PolkaPulseCore after each successful harvest cycle.
    ///
    /// @dev    This is the only function that changes the exchange rate.
    ///         It increases totalDotManaged without changing totalShares,
    ///         so every holder's DOT-equivalent balance increases proportionally.
    ///
    /// @param additionalDot  DOT yield to credit to the pool (18-decimal).
    function notifyYield(uint256 additionalDot)
        external
        onlyRole(MINTER_ROLE)
    {
        Validation.requireNonZeroAmount(additionalDot);

        totalDotManaged += additionalDot;

        emit Events.YieldNotified(
            additionalDot,
            exchangeRate(),
            totalDotManaged
        );
    }

    /// @notice Increase totalDotManaged on deposit (called by PolkaPulseCore).
    /// @param amount DOT deposited (18-decimal).
    function recordDeposit(uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        Validation.requireNonZeroAmount(amount);
        totalDotManaged += amount;
    }

    /// @notice Decrease totalDotManaged on withdrawal (called by PolkaPulseCore).
    /// @param amount DOT withdrawn (18-decimal).
    function recordWithdrawal(uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        Validation.requireNonZeroAmount(amount);
        if (amount > totalDotManaged)
            revert Validation.AmountAboveMaximum(amount, totalDotManaged);
        totalDotManaged -= amount;
    }

    // -------------------------------------------------------------------------
    // ERC-20 transfer overrides — shares-aware
    // -------------------------------------------------------------------------

    /// @notice Transfer DOT-equivalent amount from caller to recipient.
    ///         Internally converts to shares and transfers shares.
    function transfer(address to, uint256 dotAmount)
        public
        override
        returns (bool)
    {
        Validation.requireNonZeroAddress(to);
        Validation.requireNonZeroAmount(dotAmount);

        uint256 shares = dotToShares(dotAmount);
        Validation.requireSufficientShares(shares, _shares[msg.sender]);

        _shares[msg.sender] -= shares;
        _shares[to]         += shares;

        emit Transfer(msg.sender, to, dotAmount);
        return true;
    }

    /// @notice transferFrom is intentionally restricted — ppDOT does not support
    ///         ERC-20 allowance-based transfers to avoid composability edge cases
    ///         with the rebasing model in lending or AMM integrations.
    ///         Direct transfers via transfer() are always available.
    function transferFrom(address, address, uint256)
        public
        pure
        override
        returns (bool)
    {
        revert("ppDOT: transferFrom not supported. Use transfer().");
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -------------------------------------------------------------------------

    /// @notice Only the Timelock (UPGRADER_ROLE) can authorise an upgrade.
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {
        emit Events.UpgradeAuthorised(
            _getImplementation(),
            newImplementation,
            msg.sender
        );
    }

    /// @dev Helper to read ERC-1967 implementation slot.
    function _getImplementation() internal view returns (address impl) {
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        assembly { impl := sload(slot) }
    }
}