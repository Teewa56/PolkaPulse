// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title PolkaPulseProxy
/// @notice UUPS (ERC-1967) transparent proxy wrapping the PolkaPulseCore
///         implementation. All user calls are delegated to the current
///         implementation address stored in the ERC-1967 implementation slot.
///
/// @dev    UPGRADE MECHANISM:
///         Upgrades are performed by calling `upgradeToAndCall()` on the
///         *implementation* contract (PolkaPulseCore), not on the proxy itself.
///         The implementation's `_authorizeUpgrade()` function gates this call
///         behind the UPGRADER_ROLE, which is held exclusively by the
///         PolkaPulseTimelock. This means every upgrade must pass through:
///           PolkaPulseMultisig (M-of-N propose + confirm)
///           → PolkaPulseTimelock (48-hour queue)
///           → PolkaPulseCore._authorizeUpgrade() (UPGRADER_ROLE check)
///
///         STORAGE LAYOUT:
///         Only the ERC-1967 implementation and admin slots are used by the
///         proxy. All protocol state lives in PolkaPulseCore's storage layout
///         and is preserved across upgrades as long as the implementation
///         appends rather than re-orders storage variables.
///
///         CONSTRUCTOR CALL:
///         The `data` parameter is used to call `initialize()` on the first
///         implementation atomically with proxy deployment, preventing
///         frontrunning of the initializer.
///
/// @param implementation  Address of the first PolkaPulseCore implementation.
/// @param data            ABI-encoded initializer call (e.g. initialize(...)).
contract PolkaPulseProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data)
        ERC1967Proxy(implementation, data)
    {}
}