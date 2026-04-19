use thiserror::Error;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("thread `{0}` was not found")]
    ThreadNotFound(String),
    #[error("response stream event `{0}` was missing required fields")]
    MissingField(&'static str),
    #[error("cannot continue turn before a response has been completed")]
    MissingResponseId,
}

pub type Result<T> = std::result::Result<T, RuntimeError>;
