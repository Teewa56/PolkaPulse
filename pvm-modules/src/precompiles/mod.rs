/// Exports the two precompile wrappers that the pallet-revive runtime consumes.
/// Each precompile wraps one of the two core modules and handles the full
/// call lifecycle: receive raw bytes → decode → execute → encode → return bytes.

pub mod math_lib_precompile;
pub mod yield_optimizer_precompile;