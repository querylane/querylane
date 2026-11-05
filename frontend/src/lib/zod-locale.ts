import { config } from "zod/mini";
import en from "zod/v4/locales/en.js";

// Mini omits Classic's automatic locale setup. Keep validation messages in
// English without pulling in Classic's methods or JSON-schema converters.
config(en());
