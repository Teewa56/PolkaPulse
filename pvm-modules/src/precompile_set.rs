/// Fixed precompile address constants and the PrecompileSet dispatch implementation
/// consumed by the pallet-revive runtime configuration.
///
/// HOW PRECOMPILE ADDRESSES WORK IN PALLET-REVIVE:
/// pallet-revive assigns fixed H160 addresses to precompiles at runtime configuration
/// time. When a Solidity contract calls one of these addresses, pallet-revive
/// intercepts the call before EVM execution and routes it to the registered Rust
/// handler instead. The address is what AtomicYieldExecutor.sol hard-codes as its
/// call target — it must match exactly between this file, the Solidity contract,
/// and frontend/lib/constants/index.ts.
///
/// ADDRESS SCHEME:
/// Polkadot system precompiles live at 0x0000...0001 through 0x0000...00FF.
/// Protocol-level precompiles (like PolkaPulse's) should be placed in a higher
/// range to avoid collisions. We use the 0x0000...1000 range.
///

use sp_core::H160;
use pallet_revive::evm::Ext;
use crate::precompiles::{
    math_lib_precompile,
    yield_optimizer_precompile,
};

// ---------------------------------------------------------------------------
// Precompile address constants
// ---------------------------------------------------------------------------

/// Fixed address for the MathLib precompile.
/// Must match the address hard-coded in AtomicYieldExecutor.sol and constants/index.ts.
pub const MATH_LIB_PRECOMPILE_ADDRESS: H160 = H160([
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x01, // 0x0000...1001
]);

/// Fixed address for the YieldOptimizer precompile.
/// Must match the address hard-coded in AtomicYieldExecutor.sol and constants/index.ts.
pub const YIELD_OPTIMIZER_PRECOMPILE_ADDRESS: H160 = H160([
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x02, // 0x0000...1002
]);

// ---------------------------------------------------------------------------
// PrecompileSet implementation
// ---------------------------------------------------------------------------

/// The precompile set registered in the pallet-revive runtime config.
///
/// The runtime calls `is_precompile` to check if a target address is handled
/// by a precompile (allowing pallet-revive to short-circuit normal contract
/// execution), then calls `execute` to run the handler and return output bytes.
pub struct PolkaPulsePrecompileSet;

impl PolkaPulsePrecompileSet {
    /// Returns true if the given address maps to a registered PolkaPulse precompile.
    /// Called by the pallet-revive runtime before every contract call.
    pub fn is_precompile(address: &H160) -> bool {
        *address == MATH_LIB_PRECOMPILE_ADDRESS
            || *address == YIELD_OPTIMIZER_PRECOMPILE_ADDRESS
    }

    /// Route a call to the correct precompile handler and return the output bytes.
    /// Returns None if the address is not a registered precompile — the runtime
    /// will then proceed with normal contract execution.
    pub fn execute(address: &H160, input: &[u8]) -> Option<Vec<u8>> {
        if *address == MATH_LIB_PRECOMPILE_ADDRESS {
            return Some(math_lib_precompile::call(input));
        }
        if *address == YIELD_OPTIMIZER_PRECOMPILE_ADDRESS {
            return Some(yield_optimizer_precompile::call(input));
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Both addresses must be recognised as precompiles
    #[test]
    fn test_is_precompile_recognises_both_addresses() {
        assert!(
            PolkaPulsePrecompileSet::is_precompile(&MATH_LIB_PRECOMPILE_ADDRESS),
            "MathLib address must be a registered precompile"
        );
        assert!(
            PolkaPulsePrecompileSet::is_precompile(&YIELD_OPTIMIZER_PRECOMPILE_ADDRESS),
            "YieldOptimizer address must be a registered precompile"
        );
    }

    /// A random address must not be recognised as a precompile
    #[test]
    fn test_is_precompile_rejects_unknown_address() {
        let unknown = H160([0xde; 20]);
        assert!(
            !PolkaPulsePrecompileSet::is_precompile(&unknown),
            "Unknown address must not be a precompile"
        );
    }

    /// The two precompile addresses must be distinct
    #[test]
    fn test_precompile_addresses_are_distinct() {
        assert_ne!(
            MATH_LIB_PRECOMPILE_ADDRESS,
            YIELD_OPTIMIZER_PRECOMPILE_ADDRESS,
            "Precompile addresses must be unique"
        );
    }

    /// execute() on an unknown address must return None
    #[test]
    fn test_execute_unknown_address_returns_none() {
        let unknown = H160([0xab; 20]);
        let result = PolkaPulsePrecompileSet::execute(&unknown, &[]);
        assert!(result.is_none(), "Unknown address must return None from execute");
    }

    /// execute() on a known address must return Some (even if the call errors inside)
    #[test]
    fn test_execute_known_address_returns_some() {
        // Empty input will trigger an error inside the precompile,
        // but the outer Option must still be Some.
        let result = PolkaPulsePrecompileSet::execute(
            &MATH_LIB_PRECOMPILE_ADDRESS,
            &[],
        );
        assert!(
            result.is_some(),
            "Known address must always return Some from execute"
        );
    }
}