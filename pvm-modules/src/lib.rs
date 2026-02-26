pub mod math_lib;
pub mod yield_optimizer;
pub mod abi;
pub mod precompiles;
pub mod precompile_set;

pub use precompile_set::{
    PolkaPulsePrecompileSet,
    MATH_LIB_PRECOMPILE_ADDRESS,
    YIELD_OPTIMIZER_PRECOMPILE_ADDRESS,
};

#[cfg(test)]
mod tests;