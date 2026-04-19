use std::cell::RefCell;

use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::runtime::Runtime;
use crate::types::ResponsesStreamEvent;
use crate::types::RuntimeConfig;
use crate::types::StartTurnArgs;
use crate::types::ToolOutput;

#[wasm_bindgen]
pub struct WasmCodexRuntime {
    inner: RefCell<Runtime>,
}

#[wasm_bindgen]
impl WasmCodexRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<WasmCodexRuntime, JsValue> {
        let config = if config.is_null() || config.is_undefined() {
            RuntimeConfig::default()
        } else {
            serde_wasm_bindgen::from_value(config).map_err(to_js_error)?
        };

        Ok(Self {
            inner: RefCell::new(Runtime::new(config)),
        })
    }

    pub fn start_turn(&self, args: JsValue) -> Result<JsValue, JsValue> {
        let args: StartTurnArgs = serde_wasm_bindgen::from_value(args).map_err(to_js_error)?;
        let result = self
            .inner
            .borrow_mut()
            .start_turn(args)
            .map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(to_js_error)
    }

    pub fn ingest_stream_event(
        &self,
        thread_id: String,
        event: JsValue,
    ) -> Result<JsValue, JsValue> {
        let event: ResponsesStreamEvent =
            serde_wasm_bindgen::from_value(event).map_err(to_js_error)?;
        let result = self
            .inner
            .borrow_mut()
            .ingest_stream_event(&thread_id, event)
            .map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(to_js_error)
    }

    pub fn complete_response(&self, thread_id: String) -> Result<JsValue, JsValue> {
        let result = self
            .inner
            .borrow_mut()
            .complete_response(&thread_id)
            .map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(to_js_error)
    }

    pub fn submit_tool_outputs(
        &self,
        thread_id: String,
        outputs: JsValue,
    ) -> Result<JsValue, JsValue> {
        let outputs: Vec<ToolOutput> =
            serde_wasm_bindgen::from_value(outputs).map_err(to_js_error)?;
        let result = self
            .inner
            .borrow_mut()
            .submit_tool_outputs(&thread_id, outputs)
            .map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(to_js_error)
    }
}

fn to_js_error<E: std::fmt::Display>(error: E) -> JsValue {
    JsValue::from_str(&error.to_string())
}
