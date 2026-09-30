import {
  AutoTokenizer,
  AutoModelForCausalLM,
  env,
  type Tensor,
} from "@huggingface/transformers";
import { localModel, localModelRevision, workoutPrompt } from "./workout-ai";
import type { Unit } from "./workout";

env.allowLocalModels = false;
// Files are downloaded; inference and workout text stay in this worker.
self.onmessage = async (event: MessageEvent<{ text: string; units: Unit }>) => {
  try {
    const messages = workoutPrompt(event.data.text, event.data.units);
    self.postMessage({
      status: "progress",
      message: "Downloading local AI files (first use only)…",
    });
    const progress_callback = (p: { status: string; progress?: number }) => {
      if (p.status === "progress")
        self.postMessage({
          status: "progress",
          message: `Downloading AI file: ${Math.round(p.progress ?? 0)}%`,
        });
    };
    const tokenizer = await AutoTokenizer.from_pretrained(localModel, {
      revision: localModelRevision,
      progress_callback,
    });
    const model = await AutoModelForCausalLM.from_pretrained(localModel, {
      revision: localModelRevision,
      dtype: "q4",
      device: "wasm",
      progress_callback,
    });
    self.postMessage({
      status: "progress",
      message:
        "Reading your workout on this device. This may take a few minutes…",
    });
    const templateOptions = {
      add_generation_prompt: true,
      return_dict: true,
      enable_thinking: false,
    };
    const inputs = tokenizer.apply_chat_template(
      messages,
      templateOptions,
    ) as Record<string, Tensor>;
    const output = await model.generate({
      ...inputs,
      max_new_tokens: 600,
      do_sample: false,
    });
    const sequence = (output as Tensor)
      .tolist()[0]
      .slice(inputs.input_ids.dims[1]);
    const raw = tokenizer.decode(sequence, { skip_special_tokens: true });
    await model.dispose();
    self.postMessage({ status: "complete", raw });
  } catch {
    self.postMessage({
      status: "error",
      message:
        "Local AI could not run on this device. Check your connection and available memory, or use standard review. No workout was added.",
    });
  }
};
